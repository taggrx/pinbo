<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import {
		account,
		isConnected,
		wrongNetwork,
		connect,
		disconnect,
		autoConnect,
		postMessage,
		waitForMessage,
		watchMessages,
		getMessageByTxHash,
		getMessagesByAddress,
		createMessageLoader,
		getFee,
		TOPIC_TYPE,
	} from '$lib/ethereum';
	import { hexToBytes, formatEther } from 'viem';
	import { fade } from 'svelte/transition';
	import { renderMarkdown } from '$lib/utils';
	import Address from '$lib/components/Address.svelte';
	import Message from '$lib/components/Message.svelte';
	import TuiEditor from '$lib/components/TuiEditor.svelte';
	import { ROUTES, type Message as MessageType } from '$lib/types';
	import { pinboChain } from '$lib/chains';
	import readme from '../../../README.md?raw';

	let aboutContent = $state('');

	if (browser) {
		aboutContent = renderMarkdown(readme);
	}

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
	let permalinkMessage = $state<MessageType | null>(null);
	let permalinkLoading = $state(false);
	let messageLoader: ReturnType<typeof createMessageLoader> | null = null;
	let hasMore = $state(false);
	let loadingMore = $state(false);
	let showPostForm = $state(false);
	let showAbout = $state(false);
	let globalError = $state<string | null>(null);
	let replyTo = $state<MessageType | null>(null);
	let profileAddress = $state<string | null>(null);
	let profileMessages = $state<MessageType[]>([]);
	let profileLoading = $state(false);
	let fee = $state<bigint | null>(null);

	const rpcUrlFull = import.meta.env.VITE_LOCAL_RPC_URL;

	$effect(() => {
		if (showPostForm) {
			getFee()
				.then((f) => (fee = f))
				.catch(() => {});
		} else {
			fee = null;
		}
	});

	function togglePostForm() {
		showPostForm = !showPostForm;
		if (!showPostForm) replyTo = null;
	}

	function handleReply(message: MessageType) {
		replyTo = message;
		showPostForm = true;
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}


	async function handleHashChange() {
		if (!browser) return;
		const hash = window.location.hash;
		showPostForm = false;
		replyTo = null;
		profileAddress = null;
		profileMessages = [];

		if (hash === ROUTES.ABOUT) {
			showAbout = true;
		} else {
			showAbout = false;
			const permalinkMatch = hash.match(/^#\/p\/(0x[a-fA-F0-9]{64})$/);
			const profileMatch = hash.match(/^#\/u\/(0x[a-fA-F0-9]{40})$/i);

			if (permalinkMatch) {
				permalinkMessage = null;
				permalinkLoading = true;
				try {
					permalinkMessage = await getMessageByTxHash(permalinkMatch[1] as `0x${string}`);
				} catch {
					permalinkMessage = null;
				} finally {
					permalinkLoading = false;
				}
			} else if (profileMatch) {
				permalinkMessage = null;
				profileAddress = profileMatch[1];
				profileLoading = true;
				try {
					profileMessages = await getMessagesByAddress(profileMatch[1] as `0x${string}`);
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
		await autoConnect();
		handleHashChange();
		window.addEventListener('hashchange', handleHashChange);
		try {
			messageLoader = createMessageLoader();
			const { hasMore: more } = await messageLoader.loadInitialStreaming(
				50,
				(pageMessages: any[]) => {
					if (messages.length === 0) {
						messages = pageMessages;
					} else {
						messages = [...messages, ...pageMessages];
					}
				}
			);
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
			const topics: Array<[number, Uint8Array]> | null = replyTo
				? [[TOPIC_TYPE.REPOST, hexToBytes(replyTo.txHash as `0x${string}`)]]
				: null;
			const txHash = await postMessage(newMessage.trim(), topics);
			pendingTxHash = txHash;
			newMessage = '';
			replyTo = null;
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
		<title>Pinbo — {permalinkMessage.sender.slice(0, 6)}…{permalinkMessage.sender.slice(-4)}</title>
		<meta
			property="og:title"
			content="Pinbo — {permalinkMessage.sender.slice(0, 6)}…{permalinkMessage.sender.slice(-4)}"
		/>
		<meta property="og:description" content={permalinkMessage.message.slice(0, 200)} />
	{:else if profileAddress}
		<title>Pinbo — {profileAddress.slice(0, 6)}…{profileAddress.slice(-4)}</title>
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
			<a href={ROUTES.ABOUT} class="about-link">About</a>
			{#if $isConnected}
				<span class="middot">·</span>
				<div class="connected">
					<Address address={$account!} />
					<button class="btn-icon" onclick={disconnect} title="Disconnect">⏻</button>
					<button
						class="btn post-btn"
						onclick={togglePostForm}
						disabled={showAbout || !!permalinkMessage || !!profileAddress}>POST</button
					>
				</div>
				<button
					class="btn post-fab"
					onclick={togglePostForm}
					disabled={showAbout || !!permalinkMessage || !!profileAddress}
					style:display={showPostForm ? 'none' : ''}>+</button
				>
			{:else}
				<button
					class="btn connect"
					onclick={async () => {
						globalError = null;
						try {
							await connect();
						} catch (e) {
							globalError = (e as Error).message;
						}
					}}>CONNECT WALLET</button
				>
			{/if}
		</div>
	</header>

	{#if globalError}
		<div class="error-banner" role="alert">
			{globalError}
			<button class="error-close" onclick={() => (globalError = null)}>✕</button>
		</div>
	{/if}

	{#if $wrongNetwork}
		<div class="error-banner" role="alert">
			Wrong network — please switch your wallet to {pinboChain.name}.
		</div>
	{/if}

	<main>
		{#if $isConnected && !$wrongNetwork && !permalinkMessage && !showAbout && !profileAddress}
			{#if pendingTxHash}
				<div class="loading">LOADING...</div>
			{:else if showPostForm}
				<div class="post-section">
					<div class="input-group">
						<TuiEditor bind:value={newMessage} placeholder="What's on your mind?" />
						<div class="btn-row">
							<button
								class="btn btn-secondary"
								onclick={() => {
									replyTo = null;
									showPostForm = false;
								}}>CLOSE</button
							>
							<button class="btn" onclick={handlePost} disabled={posting || !newMessage.trim()}>
								{posting ? 'SENDING' : replyTo ? 'REPLY' : 'SEND'}
							</button>
						</div>
						{#if fee !== null}
							<div class="fee-info">Fee: {formatEther(fee)} ETH + gas</div>
						{/if}
					</div>
					{#if replyTo}
						<div class="reply-to">
							<Message message={replyTo} showPermalink={false} showReply={false} />
						</div>
					{/if}
				</div>
			{/if}
		{/if}

		{#if showAbout}
			<div class="about-section">
				{@html aboutContent}
			</div>
		{:else if permalinkLoading}
			<div class="loading">LOADING...</div>
		{:else if permalinkMessage}
			<Message message={permalinkMessage} showPermalink={false} />
			<div class="permalink-tx">
				TX: <a
					href={`https://etherscan.io/tx/${permalinkMessage.txHash}`}
					target="_blank"
					rel="noopener noreferrer">{permalinkMessage.txHash}</a
				>
				</div>
		{:else if profileAddress}
			<div class="profile-section">
				<div class="profile-header">
					Messages from <Address address={profileAddress as `0x${string}`} showFull={true} />
				</div>
				{#if profileLoading}
					<div class="loading">LOADING...</div>
				{:else if profileMessages.length === 0}
					<div class="empty">NO MESSAGES FROM THIS ADDRESS.</div>
				{:else}
					<div class="messages-list">
						{#each profileMessages as message (message.txHash)}
							<div transition:fade>
								<Message {message} showSender={false} onReply={$isConnected ? handleReply : undefined} />
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{:else if !replyTo}
			<div class="messages-section">
				{#if loading}
					<div class="loading">LOADING...</div>
				{:else if messages.length === 0}
					<div class="empty">NO MESSAGES YET. BE THE FIRST TO POST!</div>
				{:else}
					<div class="messages-list">
						{#each messages as message (message.txHash)}
							<div transition:fade>
								<Message {message} onReply={$isConnected ? handleReply : undefined} />
							</div>
						{/each}
					</div>
					{#if hasMore}
						<div class="load-more">
							<button class="btn" onclick={handleLoadMore} disabled={loadingMore}>
								{loadingMore ? 'LOADING...' : 'MORE'}
							</button>
						</div>
					{/if}
				{/if}
			</div>
		{/if}
	</main>
	<footer class="footer">
		<a href={rpcUrlFull} target="_blank" rel="noopener noreferrer">RPC</a> &middot;
		<a
			href={`https://etherscan.io/address/${import.meta.env.VITE_PINBO_CONTRACT_ADDRESS}`}
			target="_blank"
			rel="noopener noreferrer">Contract</a
		>
		&middot;
		<a href="https://github.com/taggrx/pinbo" target="_blank" rel="noopener noreferrer">GitHub</a>
		&middot; {__GIT_TAG__}
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
	}
	.logo button:hover {
		opacity: 0.8;
	}
	.wallet-section {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.connected {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.95rem;
	}
	.about-link {
		color: var(--text-secondary);
		text-decoration: none;
	}
	.about-link:hover {
		color: var(--primary);
	}
	.post-btn {
		margin-left: 0.5rem;
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
	.btn-icon {
		background: none;
		border: none;
		color: var(--text-secondary);
		cursor: pointer;
		font-size: 1rem;
		padding: 0.25rem;
		margin-left: 0.25rem;
	}
	.btn-icon:hover {
		color: var(--error);
	}
	.btn.connect,
	.btn.post-btn {
		background-color: var(--secondary);
		margin-left: 1rem;
	}
	.error-banner {
		background: var(--bg-red);
		color: var(--error);
		padding: 0.75rem 1rem;
		border-radius: 0.375rem;
		margin-bottom: 1rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.875rem;
	}
	.error-close {
		background: none;
		border: none;
		color: var(--error);
		cursor: pointer;
		font-size: 0.875rem;
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
	.fee-info {
		font-size: 0.8rem;
		color: var(--text-secondary);
		font-family: var(--font-mono);
		text-align: right;
	}
	.loading,
	.empty {
		text-align: center;
		padding: 2rem;
		color: var(--text-secondary);
	}
	main > .loading {
		margin: 2rem auto;
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 200px;
	}
	.messages-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.load-more {
		display: flex;
		justify-content: center;
		margin-top: 2rem;
		margin-bottom: 2rem;
	}
	.permalink-tx {
		text-align: center;
		margin-top: 2rem;
		font-size: 0.75rem;
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
		gap: 0.6rem;
	}
	.footer {
		margin-top: 4rem;
		padding: 1rem 0;
		border-top: 1px solid var(--surface-alt);
		background: var(--background);
		text-align: center;
		font-size: 0.65rem;
		color: var(--text-secondary);
	}
</style>
