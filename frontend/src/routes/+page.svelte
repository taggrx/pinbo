<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { browser } from '$app/environment';
	import {
		account,
		isConnected,
		wrongNetwork,
		initWallet,
		postMessage,
		waitForMessage,
		watchMessages,
		getMessageByTxHash,
		getMessagesByAddress,
		getInboxMessages,
		getAddressInfo,
		createMessageLoader,
		getFee,
		refreshLatestBlock,
		checkChainId,
		TOPIC_TYPE,
		getCustomRpc,
		setCustomRpc,
		type AddressInfo,
	} from '$lib/ethereum';
	import { idbGetMeta } from '$lib/idb';
	import { hexToBytes, bytesToHex, isAddress } from 'viem';
	import { fade } from 'svelte/transition';
	import { ROUTES, type Message as MessageType } from '$lib/types';
	import { shortAddr } from '$lib/utils';
	import { pinboChain } from '$lib/chains';
	import readme from '../../../README.md?raw';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import ErrorBanner from '$lib/components/ErrorBanner.svelte';
	import PostForm from '$lib/components/PostForm.svelte';
	import PermalinkView from '$lib/components/PermalinkView.svelte';
	import ProfileView from '$lib/components/ProfileView.svelte';
	import InboxView from '$lib/components/InboxView.svelte';
	import MessageList from '$lib/components/MessageList.svelte';
	import MarkdownContent from '$lib/components/MarkdownContent.svelte';

	// --- Route patterns ---
	const PERMALINK_RE = /^#\/p\/(0x[a-fA-F0-9]{64})$/;
	const PROFILE_RE = /^#\/a\/(0x[a-fA-F0-9]{40})$/i;
	const INBOX_RE = /^#\/i\/(0x[a-fA-F0-9]{40})$/i;

	// --- Global UI ---
	let globalError = $state<string | null>(null);
	let showAbout = $state(false);

	function handleError(err: unknown) {
		console.error(err);
		globalError = ((err as Error).message ?? String(err)).split('\n')[0];
	}

	// --- Feed state ---
	let messages = $state<MessageType[]>([]);
	let loading = $state(true);
	let messageLoader: ReturnType<typeof createMessageLoader> | null = null;
	let hasMore = $state(false);
	let loadingMore = $state(false);
	let syncStatus = $state<'checking' | 'loading' | null>('checking');

	// --- Post form ---
	const DRAFT_KEY = 'pinbo_draft';
	let newMessage = $state(browser ? (localStorage.getItem(DRAFT_KEY) ?? '') : '');
	let posting = $state(false);
	let pendingTxHash = $state<string | null>(null);
	let showPostForm = $state(false);
	let replyTo = $state<MessageType | null>(null);
	let pendingReply = false;
	let fee = $state<bigint | null>(null);
	let toAddress = $state('');
	let toAddressLocked = $state(false);

	$effect(() => {
		if (newMessage) {
			localStorage.setItem(DRAFT_KEY, newMessage);
		} else {
			localStorage.removeItem(DRAFT_KEY);
		}
	});

	// --- Permalink state ---
	let permalinkMessage = $state<MessageType | null>(null);
	let permalinkLoading = $state(false);

	// --- Profile state ---
	let profileAddress = $state<string | null>(null);
	let profileMessages = $state<MessageType[]>([]);
	let profileLoading = $state(false);
	let profileInfo = $state<AddressInfo | null>(null);

	// --- Inbox state ---
	let inboxAddress = $state<string | null>(null);
	let inboxMessages = $state<MessageType[]>([]);
	let inboxLoading = $state(false);

	// --- View caches ---
	type ProfileCacheEntry = { messages: MessageType[]; info: AddressInfo | null; ts: number };
	const profileCache = new Map<string, ProfileCacheEntry>();
	const inboxCache = new Map<string, { messages: MessageType[]; ts: number }>();
	const VIEW_CACHE_TTL = 5 * 60 * 1000;

	// --- Lifecycle refs ---
	let unwatch: (() => void) | null = null;
	let unwatchWallet: (() => void) | null = null;
	let blockRefreshInterval: ReturnType<typeof setInterval> | null = null;

	const isOwnInbox = $derived(
		!!inboxAddress && !!$account && inboxAddress.toLowerCase() === $account.toLowerCase()
	);

	const dmMessages = $derived(
		$account
			? messages.filter((m) =>
					(m.topics ?? []).some(
						([type, bytes]) =>
							type === TOPIC_TYPE.ADDRESS &&
							bytesToHex(bytes as Uint8Array).toLowerCase() === $account!.toLowerCase()
					)
				)
			: []
	);
	const dmCount = $derived(dmMessages.length);

	function resetPostForm() {
		replyTo = null;
		toAddress = '';
		toAddressLocked = false;
	}

	function togglePostForm() {
		showPostForm = !showPostForm;
		if (!showPostForm) resetPostForm();
	}

	function handleMessageTo(address: string) {
		if (showPostForm) {
			showPostForm = false;
			resetPostForm();
			return;
		}
		toAddress = address;
		toAddressLocked = true;
		showPostForm = true;
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	async function handleReply(message: MessageType) {
		if (permalinkMessage?.txHash === message.txHash) {
			if (showPostForm) {
				showPostForm = false;
				resetPostForm();
				return;
			}
			replyTo = message;
			showPostForm = true;
			await tick();
			document
				.querySelector('.post-section')
				?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		} else {
			pendingReply = true;
			window.location.hash = ROUTES.MESSAGE(message.txHash);
		}
	}

	async function loadPermalink(txHash: `0x${string}`) {
		permalinkLoading = true;
		try {
			permalinkMessage = await getMessageByTxHash(txHash);
			if (pendingReply && permalinkMessage) {
				pendingReply = false;
				replyTo = permalinkMessage;
				showPostForm = true;
				await tick();
				document
					.querySelector('.post-section')
					?.scrollIntoView({ behavior: 'smooth', block: 'start' });
			}
		} catch (err) {
			handleError(err);
			permalinkMessage = null;
		} finally {
			permalinkLoading = false;
		}
	}

	async function loadProfile(addr: string) {
		profileAddress = addr;
		const key = addr.toLowerCase();
		const cached = profileCache.get(key);
		if (cached && Date.now() - cached.ts < VIEW_CACHE_TTL) {
			profileMessages = cached.messages;
			profileInfo = cached.info;
			return;
		}
		profileLoading = true;
		try {
			await Promise.all([
				getAddressInfo(addr as `0x${string}`).then((info) => {
					profileInfo = info;
				}),
				getMessagesByAddress(addr as `0x${string}`, (page) => {
					profileMessages = [...profileMessages, ...page];
				}),
			]);
			profileCache.set(key, { messages: profileMessages, info: profileInfo, ts: Date.now() });
		} catch (err) {
			handleError(err);
			profileMessages = [];
		} finally {
			profileLoading = false;
		}
	}

	async function loadInbox(addr: string) {
		inboxAddress = addr;
		const key = addr.toLowerCase();
		const cached = inboxCache.get(key);
		if (cached && Date.now() - cached.ts < VIEW_CACHE_TTL) {
			inboxMessages = cached.messages;
			return;
		}
		inboxLoading = true;
		try {
			await getInboxMessages(addr as `0x${string}`, (page) => {
				inboxMessages = [...inboxMessages, ...page];
			});
			inboxCache.set(key, { messages: inboxMessages, ts: Date.now() });
		} catch (err) {
			handleError(err);
			inboxMessages = [];
		} finally {
			inboxLoading = false;
		}
	}

	async function handleHashChange() {
		if (!browser) return;
		const hash = window.location.hash;

		// Reset all route state
		showPostForm = false;
		replyTo = null;
		permalinkMessage = null;
		permalinkLoading = false;
		profileAddress = null;
		profileMessages = [];
		profileInfo = null;
		inboxAddress = null;
		inboxMessages = [];
		showAbout = false;

		if (hash === ROUTES.ABOUT) {
			showAbout = true;
			return;
		}

		const permalinkMatch = hash.match(PERMALINK_RE);
		if (permalinkMatch) return loadPermalink(permalinkMatch[1] as `0x${string}`);

		const profileMatch = hash.match(PROFILE_RE);
		if (profileMatch) return loadProfile(profileMatch[1]);

		const inboxMatch = hash.match(INBOX_RE);
		if (inboxMatch) return loadInbox(inboxMatch[1]);
	}

	onMount(async () => {
		unwatchWallet = initWallet();

		handleHashChange();
		window.addEventListener('hashchange', handleHashChange);
		messageLoader = createMessageLoader();
		getFee()
			.then((f) => (fee = f))
			.catch(handleError);
		try {
			const [newestCachedMeta, latestBlock, newChainId] = await Promise.all([
				idbGetMeta('newestBlock').catch(() => null),
				refreshLatestBlock(),
				checkChainId().catch(() => null),
			]);
			if (newChainId !== null) {
				globalError = `Chain changed (now chain ${newChainId}). Local cache has been reset.`;
			}
			blockRefreshInterval = setInterval(() => refreshLatestBlock().catch(() => {}), 60_000);
			if (newestCachedMeta !== null && latestBlock > BigInt(newestCachedMeta)) {
				syncStatus = 'loading';
			} else {
				syncStatus = null;
			}
			const seen = new Set<string>();
			const { hasMore: more } = await messageLoader.loadInitialStreaming(
				50,
				(pageMessages: MessageType[]) => {
					const fresh = pageMessages.filter((m) => !seen.has(m.txHash));
					fresh.forEach((m) => seen.add(m.txHash));
					if (messages.length === 0) {
						messages = fresh;
					} else {
						messages = [...messages, ...fresh].sort((a, b) => b.timestamp - a.timestamp);
					}
				}
			);
			hasMore = more;
		} catch (err) {
			handleError(err);
		} finally {
			loading = false;
			syncStatus = null;
		}

		unwatch = watchMessages((message) => {
			messages = [message, ...messages];
			if (pendingTxHash && message.txHash === pendingTxHash) {
				pendingTxHash = null;
			}
		});
	});

	onDestroy(() => {
		if (unwatch) unwatch();
		if (unwatchWallet) unwatchWallet();
		if (blockRefreshInterval) clearInterval(blockRefreshInterval);
		if (browser) window.removeEventListener('hashchange', handleHashChange);
	});

	function handleRpcSettings() {
		const defaultRpc = import.meta.env.VITE_RPC_URL;
		const customRpc = getCustomRpc();
		const currentRpc = customRpc || defaultRpc;
		const label = customRpc ? ' (custom)' : ' (default)';
		if (!confirm(`Current RPC: ${currentRpc}${label}\n\nDo you want to change it?`)) return;
		const input = prompt(`New RPC URL (leave empty to reset to default):`, currentRpc);
		if (input === null) return;
		setCustomRpc(input.trim() || null);
		window.location.reload();
	}

	async function handleLoadMore() {
		if (!messageLoader || loadingMore) return;
		loadingMore = true;
		try {
			const { messages: newMessages, hasMore: more } = await messageLoader.loadMore(50);
			messages = [...messages, ...newMessages];
			hasMore = more;
		} catch (err) {
			handleError(err);
		} finally {
			loadingMore = false;
		}
	}

	async function handlePost() {
		if (!newMessage.trim() || posting) return;
		posting = true;
		globalError = null;
		try {
			const topics: Array<[number, Uint8Array]> = [];
			if (replyTo) topics.push([TOPIC_TYPE.REPOST, hexToBytes(replyTo.txHash as `0x${string}`)]);
			if (toAddress.trim() && isAddress(toAddress.trim()))
				topics.push([TOPIC_TYPE.ADDRESS, hexToBytes(toAddress.trim() as `0x${string}`)]);
			const topicsOrNull = topics.length ? topics : null;
			const txHash = await postMessage(newMessage.trim(), topicsOrNull);
			pendingTxHash = txHash;
			newMessage = '';
			resetPostForm();
			localStorage.removeItem(DRAFT_KEY);
			showPostForm = false;
			const message = await waitForMessage(txHash);
			if (!messages.some((m) => m.txHash === message.txHash)) {
				messages = [message, ...messages];
			}
			pendingTxHash = null;
			if (topicsOrNull) {
				window.location.hash = ROUTES.MESSAGE(txHash);
			}
		} catch (err) {
			handleError(err);
			pendingTxHash = null;
		} finally {
			posting = false;
		}
	}
</script>

<svelte:head>
	{#if permalinkMessage}
		<title>Pinbo — {shortAddr(permalinkMessage.sender)}</title>
		<meta property="og:title" content="Pinbo — {shortAddr(permalinkMessage.sender)}" />
		<meta property="og:description" content={permalinkMessage.message.slice(0, 200)} />
	{:else if profileAddress}
		<title>Pinbo — {shortAddr(profileAddress)}</title>
	{:else}
		<title>Pinbo</title>
	{/if}
</svelte:head>

<div class="container">
	<AppHeader
		isConnected={$isConnected}
		account={$account}
		{dmCount}
		{showPostForm}
		{showAbout}
		showLogout={isOwnInbox}
		{profileAddress}
		{permalinkMessage}
		onTogglePostForm={togglePostForm}
		onMessageTo={handleMessageTo}
	/>

	<main>
		{#if pendingTxHash && $isConnected}
			<div class="loading">Sending transaction…</div>
		{/if}

		{#if $isConnected && !$wrongNetwork && !showAbout && showPostForm && !permalinkMessage}
			<PostForm
				bind:value={newMessage}
				{posting}
				{fee}
				{toAddress}
				{toAddressLocked}
				onSubmit={handlePost}
				onClose={() => {
					resetPostForm();
					showPostForm = false;
				}}
			/>
		{/if}

		{#if inboxAddress}
			<InboxView
				address={inboxAddress}
				messages={inboxMessages}
				loading={inboxLoading}
				isOwn={isOwnInbox}
				onReply={$isConnected ? handleReply : undefined}
			/>
		{:else if showAbout}
			<div class="about-section" in:fade={{ duration: 150 }}>
				<MarkdownContent text={readme} />
			</div>
		{:else if permalinkLoading || permalinkMessage}
			<PermalinkView
				message={permalinkMessage}
				loading={permalinkLoading}
				onReply={$isConnected && !$wrongNetwork ? handleReply : undefined}
			/>
			{#if $isConnected && !$wrongNetwork && showPostForm && permalinkMessage}
				<PostForm
					bind:value={newMessage}
					{posting}
					{fee}
					isReply={true}
					onSubmit={handlePost}
					onClose={() => {
						resetPostForm();
						showPostForm = false;
					}}
				/>
			{/if}
		{:else if profileAddress}
			<ProfileView
				address={profileAddress}
				messages={profileMessages}
				loading={profileLoading}
				info={profileInfo}
				onReply={$isConnected ? handleReply : undefined}
			/>
		{:else}
			<div class="messages-section" in:fade={{ duration: 150 }}>
				{#if !$isConnected}
					<p class="tagline">
						Ethereum's censorship-resistant, open-source, persistent bulletin board.<br /><a
							href={ROUTES.ABOUT}>Learn more.</a
						>
					</p>
				{/if}
				<ErrorBanner
					{globalError}
					wrongNetwork={$wrongNetwork}
					chainName={pinboChain.name}
					onDismiss={() => (globalError = null)}
				/>
				{#if syncStatus}
					<div class="sync-banner" transition:fade={{ duration: 150 }}>
						{syncStatus === 'checking' ? 'Checking for new messages…' : 'Loading new messages…'}
					</div>
				{/if}
				<MessageList
					{messages}
					{loading}
					{hasMore}
					{loadingMore}
					emptyText="NO MESSAGES YET. BE THE FIRST TO POST!"
					onLoadMore={handleLoadMore}
					onReply={$isConnected ? handleReply : undefined}
				/>
			</div>
		{/if}
	</main>

	<footer class="footer">
		<a href={import.meta.env.VITE_RPC_URL} target="_blank" rel="noopener noreferrer">RPC</a><button
			class="rpc-settings"
			onclick={handleRpcSettings}
			title="RPC settings">⚙</button
		>
		<span class="middot">·</span>
		<a
			href={`https://etherscan.io/address/${import.meta.env.VITE_PINBO_CONTRACT_ADDRESS}`}
			target="_blank"
			rel="noopener noreferrer">Contract</a
		>
		<span class="middot">·</span>
		<a href="https://github.com/xqxpx/pinbo" target="_blank" rel="noopener noreferrer">GitHub</a>
		<span class="middot">·</span>
		<span>{__GIT_TAG__}</span>
	</footer>
</div>

<style>
	.sync-banner {
		color: var(--text-secondary);
		text-align: center;
		padding: 0.75rem 0;
		margin-bottom: 1rem;
		font-size: var(--text-sm);
	}
	.tagline {
		color: var(--text-secondary);
		font-size: 1.65rem;
		font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
		font-weight: 300;
		text-align: center;
		margin: 3.5rem 0 4rem;
	}
	.tagline a {
		color: var(--primary);
	}
	.tagline a:hover {
		opacity: 0.8;
	}
	.rpc-settings {
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		color: var(--text-secondary);
		font-size: 0.7rem;
		line-height: 1;
		opacity: 0.7;
	}
	.rpc-settings:hover {
		opacity: 1;
		color: var(--primary);
	}
	.footer {
		margin-top: 4rem;
		padding: 1rem 0;
		border-top: 1px solid var(--surface-alt);
		background: var(--background);
		display: flex;
		justify-content: center;
		align-items: center;
		gap: var(--sep-gap);
		font-size: 0.65rem;
		color: var(--text-secondary);
	}
</style>
