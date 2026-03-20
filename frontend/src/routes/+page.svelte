<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
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
		createMessageLoader,
		getFee,
		TOPIC_TYPE,
		getCustomRpc,
		setCustomRpc,
	} from '$lib/ethereum';
	import { hexToBytes, bytesToHex, isAddress } from 'viem';
	import { fade } from 'svelte/transition';
	import { ROUTES, type Message as MessageType } from '$lib/types';
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

	let messages = $state<MessageType[]>([]);
	const DRAFT_KEY = 'pinbo_draft';
	let newMessage = $state(browser ? (localStorage.getItem(DRAFT_KEY) ?? '') : '');

	$effect(() => {
		if (newMessage) {
			localStorage.setItem(DRAFT_KEY, newMessage);
		} else {
			localStorage.removeItem(DRAFT_KEY);
		}
	});

	let posting = $state(false);
	let pendingTxHash = $state<string | null>(null);
	let loading = $state(true);
	let unwatch: (() => void) | null = null;
	let unwatchWallet: (() => void) | null = null;
	let permalinkMessage = $state<MessageType | null>(null);
	let permalinkLoading = $state(false);
	let messageLoader: ReturnType<typeof createMessageLoader> | null = null;
	let hasMore = $state(false);
	let loadingMore = $state(false);
	let showPostForm = $state(false);
	let showAbout = $state(false);
	let showInbox = $state(false);
	let globalError = $state<string | null>(null);
	let replyTo = $state<MessageType | null>(null);
	let pendingReply = false;
	let profileAddress = $state<string | null>(null);
	let profileMessages = $state<MessageType[]>([]);
	let profileLoading = $state(false);
	let fee = $state<bigint | null>(null);
	let toAddress = $state('');
	let toAddressLocked = $state(false);

	const inboxMessages = $derived(
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
	const dmCount = $derived(inboxMessages.length);

	function shortAddr(addr: string) {
		return addr.slice(0, 6) + '…' + addr.slice(-4);
	}

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

	function handleReply(message: MessageType) {
		if (permalinkMessage?.txHash === message.txHash) {
			if (showPostForm) {
				showPostForm = false;
				resetPostForm();
				return;
			}
			replyTo = message;
			showPostForm = true;
			window.scrollTo({ top: 0, behavior: 'smooth' });
		} else {
			pendingReply = true;
			window.location.hash = ROUTES.MESSAGE(message.txHash);
		}
	}

	async function handleHashChange() {
		if (!browser) return;
		const hash = window.location.hash;
		showPostForm = false;
		replyTo = null;
		profileAddress = null;
		profileMessages = [];
		showInbox = false;

		if (hash === ROUTES.ABOUT) {
			showAbout = true;
		} else if (hash === ROUTES.INBOX) {
			showAbout = false;
			showInbox = true;
		} else {
			showAbout = false;
			const permalinkMatch = hash.match(/^#\/p\/(0x[a-fA-F0-9]{64})$/);
			const profileMatch = hash.match(/^#\/u\/(0x[a-fA-F0-9]{40})$/i);

			if (permalinkMatch) {
				permalinkMessage = null;
				permalinkLoading = true;
				try {
					permalinkMessage = await getMessageByTxHash(permalinkMatch[1] as `0x${string}`);
					if (pendingReply && permalinkMessage) {
						pendingReply = false;
						replyTo = permalinkMessage;
						showPostForm = true;
						window.scrollTo({ top: 0, behavior: 'smooth' });
					}
				} catch {
					permalinkMessage = null;
				} finally {
					permalinkLoading = false;
				}
			} else if (profileMatch) {
				permalinkMessage = null;
				profileAddress = profileMatch[1];
				profileLoading = true;
				profileMessages = [];
				try {
					await getMessagesByAddress(profileMatch[1] as `0x${string}`, (page) => {
						profileMessages = [...profileMessages, ...page];
					});
				} catch {
					profileMessages = [];
				} finally {
					profileLoading = false;
				}
			} else {
				permalinkMessage = null;
				permalinkLoading = false;
			}
		}
	}

	onMount(async () => {
		unwatchWallet = initWallet();
		handleHashChange();
		window.addEventListener('hashchange', handleHashChange);
		messageLoader = createMessageLoader();
		getFee().then((f) => (fee = f)).catch(() => {});
		try {
			const { hasMore: more } = await messageLoader.loadInitialStreaming(50, (pageMessages: any[]) => {
				if (messages.length === 0) {
					messages = pageMessages;
				} else {
					messages = [...messages, ...pageMessages];
				}
			});
			hasMore = more;
		} catch (err) {
			console.error('Failed to fetch messages:', err);
		} finally {
			loading = false;
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
			console.error('Failed to load more messages:', err);
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
			if (toAddress.trim() && isAddress(toAddress.trim())) topics.push([TOPIC_TYPE.ADDRESS, hexToBytes(toAddress.trim() as `0x${string}`)]);
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
			const message = (err as Error).message;
			globalError = message.split('\n')[0];
			console.error(message);
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
		{showInbox}
		{profileAddress}
		{permalinkMessage}
		onTogglePostForm={togglePostForm}
		onMessageTo={handleMessageTo}
		onReply={handleReply}
	/>

	<ErrorBanner
		{globalError}
		wrongNetwork={$wrongNetwork}
		chainName={pinboChain.name}
		onDismiss={() => (globalError = null)}
	/>

	<main>
		{#if pendingTxHash && $isConnected}
			<div class="loading">LOADING...</div>
		{/if}

		{#if $isConnected && !$wrongNetwork && !showAbout && showPostForm && !permalinkMessage}
			<PostForm
				bind:value={newMessage}
				{posting}
				{fee}
				{toAddress}
				{toAddressLocked}
				onSubmit={handlePost}
				onClose={() => { resetPostForm(); showPostForm = false; }}
			/>
		{/if}

		{#if showInbox}
			<InboxView
				messages={inboxMessages}
				loading={loading}
				isConnected={$isConnected}
				onReply={handleReply}
			/>
		{:else if showAbout}
			<div class="about-section" in:fade={{ duration: 150 }}>
				<MarkdownContent text={readme} />
			</div>
		{:else if permalinkLoading || permalinkMessage}
			<PermalinkView
				message={permalinkMessage}
				loading={permalinkLoading}
				isConnected={$isConnected}
				wrongNetwork={$wrongNetwork}
				{showPostForm}
				bind:newMessage
				{posting}
				{fee}
				onPost={handlePost}
				onCloseForm={() => { resetPostForm(); showPostForm = false; }}
			/>
		{:else if profileAddress}
			<ProfileView
				address={profileAddress}
				messages={profileMessages}
				loading={profileLoading}
				isConnected={$isConnected}
				onReply={handleReply}
			/>
		{:else}
			<div class="messages-section" in:fade={{ duration: 150 }}>
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
		<a href={import.meta.env.VITE_RPC_URL} target="_blank" rel="noopener noreferrer">RPC</a><button class="rpc-settings" onclick={handleRpcSettings} title="RPC settings">⚙</button>
		<span class="middot">·</span>
		<a href={`https://etherscan.io/address/${import.meta.env.VITE_PINBO_CONTRACT_ADDRESS}`} target="_blank" rel="noopener noreferrer">Contract</a>
		<span class="middot">·</span>
		<a href="https://github.com/taggrx/pinbo" target="_blank" rel="noopener noreferrer">GitHub</a>
		<span class="middot">·</span>
		<span>{__GIT_TAG__}</span>
	</footer>
</div>

<style>
	.loading {
		text-align: center;
		padding: 2rem;
		color: var(--text-secondary);
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 200px;
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
