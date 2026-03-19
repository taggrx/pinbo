<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import {
		account,
		isConnected,
		wrongNetwork,
		connect,
		disconnect,
		initWallet,
		postMessage,
		waitForMessage,
		watchMessages,
		getMessageByTxHash,
		getMessagesByAddress,
		createMessageLoader,
		getFee,
		TOPIC_TYPE,
	} from '$lib/ethereum';
	import { hexToBytes, bytesToHex, formatEther, isAddress } from 'viem';
	import { fade, slide } from 'svelte/transition';
	import Address from '$lib/components/Address.svelte';
	import Message from '$lib/components/Message.svelte';
	import MessageList from '$lib/components/MessageList.svelte';
	import MarkdownContent from '$lib/components/MarkdownContent.svelte';
	import TuiEditor from '$lib/components/TuiEditor.svelte';
	import { ROUTES, type Message as MessageType } from '$lib/types';
	import { pinboChain } from '$lib/chains';
	import readme from '../../../README.md?raw';



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
	let globalError = $state<string | null>(null);
	let replyTo = $state<MessageType | null>(null);
	let pendingReply = false;
	let showInbox = $state(false);
	let profileAddress = $state<string | null>(null);
	let profileMessages = $state<MessageType[]>([]);
	let profileLoading = $state(false);
	let fee = $state<bigint | null>(null);
	let toAddress = $state('');
	let toAddressLocked = $state(false);
	const toAddressValid = $derived(toAddress.trim() === '' || isAddress(toAddress.trim()));

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
		if (browser) {
			window.removeEventListener('hashchange', handleHashChange);
		}
	});

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
	<header class="header">
		<h1 class="logo">
			<button onclick={() => (window.location.hash = '')}>
				<img src="favicon.svg" width="26" height="26" alt="" aria-hidden="true" />
				PINBO
			</button>
		</h1>
		<div class="wallet-section">
			<a href={ROUTES.ABOUT} class="about-link">ABOUT</a>
			{#if $isConnected}
				<span class="middot">·</span>
				<div class="connected">
					<Address address={$account!} href={ROUTES.INBOX} />{#if dmCount > 0}<span class="dm-count">[{dmCount}]</span>{/if}
					{#if showInbox}
						<button class="btn post-btn btn-logout" onclick={disconnect}>LOGOUT</button>
					{:else}
						<button
							class="btn post-btn"
							onclick={profileAddress
								? () => handleMessageTo(profileAddress!)
								: permalinkMessage
									? () => handleReply(permalinkMessage!)
									: togglePostForm}
							disabled={showAbout}
						>{profileAddress ? 'DM' : permalinkMessage ? 'REPLY' : 'POST'}</button>
					{/if}
				</div>
				<button
					class="btn post-fab"
					onclick={profileAddress
						? () => handleMessageTo(profileAddress!)
						: permalinkMessage
							? () => handleReply(permalinkMessage!)
							: togglePostForm}
					disabled={showAbout}
					style:display={showPostForm ? 'none' : ''}
				>{profileAddress ? '✉' : permalinkMessage ? '↩' : '+'}</button
				>
			{:else}
				<button class="btn connect" onclick={connect}>CONNECT WALLET</button>
			{/if}
		</div>
	</header>

	{#if globalError}
		<div class="error-banner" role="alert" transition:fade={{ duration: 150 }}>
			{globalError}
			<button class="error-close" onclick={() => (globalError = null)}>✕</button>
		</div>
	{/if}

	{#if $wrongNetwork}
		<div class="error-banner" role="alert" transition:fade={{ duration: 150 }}>
			Wrong network — please switch your wallet to {pinboChain.name}.
		</div>
	{/if}

	<main>
		{#if pendingTxHash && $isConnected}
			<div class="loading">LOADING...</div>
		{/if}
		{#if $isConnected && !$wrongNetwork && !showAbout && showPostForm && !permalinkMessage}
				<div class="post-section" transition:slide={{ duration: 200 }}>
					<div class="input-group">
						{#if toAddressLocked}
							<div class="to-field">
								<span class="to-label">TO:</span>
								<input
									class="to-input"
									value={toAddress}
									disabled
									spellcheck="false"
								/>
							</div>
						{/if}
						<TuiEditor bind:value={newMessage} placeholder="What's on your mind?" />
						<div class="btn-row">
							<button
								class="btn btn-secondary"
								onclick={() => {
									resetPostForm();
									showPostForm = false;
								}}>CLOSE</button
							>
							<button class="btn" onclick={handlePost} disabled={posting || !newMessage.trim() || !toAddressValid}>
								{posting ? 'SENDING' : 'SEND'}
							</button>
						</div>
						{#if fee !== null}
							<div class="fee-info">Fee: {formatEther(fee)} ETH + gas</div>
						{/if}
					</div>
				</div>
		{/if}

		{#if showInbox}
			<div class="profile-section" in:fade={{ duration: 150 }}>
				<h2 class="profile-header">INBOX</h2>
				<MessageList
					messages={inboxMessages}
					loading={loading}
					showSender={true}
					emptyText="NO MESSAGES ADDRESSED TO YOU YET."
					onReply={$isConnected ? handleReply : undefined}
				/>
			</div>
		{:else if showAbout}
			<div class="about-section" in:fade={{ duration: 150 }}>
				<MarkdownContent text={readme} />
			</div>
		{:else if permalinkLoading}
			<div class="loading" in:fade={{ duration: 150 }}>LOADING...</div>
		{:else if permalinkMessage}
			<div in:fade={{ duration: 150 }}>
				<Message message={permalinkMessage} showPermalink={false} showReply={false} truncate={false} />
				<div class="permalink-tx">
					<a
						href={`https://etherscan.io/tx/${permalinkMessage.txHash}`}
						target="_blank"
						rel="noopener noreferrer">BLOCKCHAIN TRANSACTION</a
					>
				</div>
				{#if $isConnected && !$wrongNetwork && showPostForm}
					<div class="post-section" transition:slide={{ duration: 200 }}>
						<div class="input-group">
							<TuiEditor bind:value={newMessage} placeholder="Write a reply…" />
							<div class="btn-row">
								<button
									class="btn btn-secondary"
									onclick={() => {
										resetPostForm();
										showPostForm = false;
									}}>CLOSE</button
								>
								<button class="btn" onclick={handlePost} disabled={posting || !newMessage.trim()}>
									{posting ? 'REPLYING' : 'REPLY'}
								</button>
							</div>
							{#if fee !== null}
								<div class="fee-info">Fee: {formatEther(fee)} ETH + gas</div>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		{:else if profileAddress}
			<div class="profile-section" in:fade={{ duration: 150 }}>
				<div class="profile-header">
					<Address address={profileAddress as `0x${string}`} showFull={true} />
				</div>
				<MessageList
					messages={profileMessages}
					loading={profileLoading}
					showSender={false}
					emptyText="NO MESSAGES FROM THIS ADDRESS."
					onReply={$isConnected ? handleReply : undefined}
				/>
			</div>
		{:else if !replyTo}
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
		<a href={import.meta.env.VITE_RPC_URL} target="_blank" rel="noopener noreferrer">RPC</a>
		<span class="middot">·</span>
		<a href={`https://etherscan.io/address/${import.meta.env.VITE_PINBO_CONTRACT_ADDRESS}`} target="_blank" rel="noopener noreferrer">Contract</a>
		<span class="middot">·</span>
		<a href="https://github.com/taggrx/pinbo" target="_blank" rel="noopener noreferrer">GitHub</a>
		<span class="middot">·</span>
		<span>{__GIT_TAG__}</span>
	</footer>
</div>

<style>
	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 2rem 0;
		border-bottom: 1px solid var(--surface-alt);
		margin-bottom: 2rem;
	}
	.logo {
		font-size: 1.4rem;
		font-weight: 800;
		color: var(--orange);
		margin: 0;
		font-family: system-ui, sans-serif;
	}
	.logo button {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		color: inherit;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		font: inherit;
		line-height: 1;
	}
	.logo button:hover {
		opacity: 0.8;
	}
	.wallet-section {
		display: flex;
		align-items: center;
		gap: var(--sep-gap);
	}
	.connected {
		display: flex;
		align-items: center;
		gap: var(--sep-gap);
		font-size: var(--text-sm);
	}
	.dm-count {
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--text-sm);
	}
	.about-link {
		color: var(--text-secondary);
		text-decoration: none;
		font-size: var(--text-sm);
	}
	.about-link:hover {
		color: var(--primary);
	}
	.post-btn {
		margin-left: 0.5rem;
		min-width: 5.5rem;
		text-align: center;
	}
	.post-fab {
		display: none;
	}
	@media (max-width: 600px) {
		.post-btn {
			display: none;
		}
		.post-fab {
			display: flex;
			align-items: center;
			justify-content: center;
			position: fixed;
			bottom: 1.5rem;
			right: 1.5rem;
			width: 3.5rem;
			height: 3.5rem;
			border-radius: 50%;
			background-color: var(--secondary);
			color: var(--bg0);
			font-size: 1.75rem;
			border: none;
			cursor: pointer;
			box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
			z-index: 100;
		}
		.post-fab:disabled {
			opacity: 0.4;
			cursor: not-allowed;
		}
	}
	.btn.connect,
	.btn.post-btn {
		background-color: var(--secondary);
	}
	.btn.btn-logout {
		background-color: var(--error);
		color: var(--bg0);
	}
	.error-banner {
		background: var(--bg-red);
		color: var(--error);
		padding: var(--text-xs) 1rem;
		border-radius: 0.375rem;
		margin-bottom: 1rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: var(--text-sm);
	}
	.error-close {
		background: none;
		border: none;
		color: var(--error);
		cursor: pointer;
		font-size: var(--text-sm);
		padding: 0 0.25rem;
	}
	.post-section {
		margin-bottom: 2rem;
		padding: 1rem 0;
	}
	.reply-to {
		margin-top: 1rem;
	}
	.btn-row {
		display: flex;
		gap: 0.5rem;
	}
	.btn-row .btn {
		flex: 1;
	}
	.btn-secondary {
		background: var(--bg-dim);
		border: 1px solid var(--bg-dim);
		color: var(--text-secondary);
	}
	.btn-secondary:hover {
		border-color: var(--text-secondary);
	}
	.input-group {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.to-field {
		display: flex;
		align-items: center;
		gap: var(--text-xs);
	}
	.to-label {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--text-secondary);
		flex-shrink: 0;
	}
	.to-input {
		flex: 1;
		background: var(--bg2);
		border: 1px solid var(--surface-alt);
		border-radius: 0.375rem;
		color: var(--text);
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		padding: 0.375rem 0.625rem;
		outline: none;
	}
	.to-input:focus {
		border-color: var(--primary);
	}
	.to-input.invalid {
		border-color: var(--error);
	}
	.fee-info {
		font-size: var(--text-sm);
		color: var(--text-secondary);
		font-family: var(--font-mono);
		text-align: right;
	}
	.loading {
		text-align: center;
		padding: 2rem;
		color: var(--text-secondary);
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 200px;
	}
	.permalink-tx {
		text-align: center;
		margin: 2rem 0 1rem;
		font-size: var(--text-xs);
		font-family: var(--font-mono);
		color: var(--text-secondary);
		word-break: break-all;
	}
	.profile-section {
		margin-top: 1rem;
	}
	.profile-header {
		margin-bottom: 1.5rem;
		font-size: 1.1rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
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
