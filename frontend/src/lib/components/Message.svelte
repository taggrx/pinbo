<script lang="ts">
	import { ROUTES, type Message as MessageType } from '$lib/types';
	import Address from './Address.svelte';
	import { renderMarkdown } from '$lib/utils';
	import { getMessageByTxHash, TOPIC_TYPE } from '$lib/ethereum';
	import { bytesToHex } from 'viem';
	import Message from './Message.svelte';

	interface Props {
		message: MessageType;
		showPermalink?: boolean;
		showReply?: boolean;
		showSender?: boolean;
		truncate?: boolean;
		onReply?: (message: MessageType) => void;
	}

	let { message, showPermalink = true, showReply = true, showSender = true, truncate = true, onReply }: Props = $props();

	let contentEl = $state<HTMLElement | null>(null);
	let expanded = $state(false);
	let overflows = $state(false);

	$effect(() => {
		if (!contentEl || !truncate) return;
		const check = () => {
			overflows = contentEl!.scrollHeight > contentEl!.clientHeight + 1;
		};
		check();
		const observer = new ResizeObserver(check);
		observer.observe(contentEl);
		return () => observer.disconnect();
	});

	const reposts = $derived((message.topics ?? []).filter(([type]) => type === TOPIC_TYPE.REPOST));

	function formatTime(timestamp: number) {
		const now = Date.now();
		const diff = now - timestamp;
		const seconds = Math.floor(diff / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);

		if (seconds < 60) return 'just now';
		if (minutes < 60) return `${minutes}m ago`;
		if (hours < 24) return `${hours}h ago`;
		if (days < 7) return `${days}d ago`;

		return new Date(timestamp).toLocaleString();
	}

	async function fetchRepost(bytes: Uint8Array) {
		const txHash = bytesToHex(bytes) as `0x${string}`;
		return getMessageByTxHash(txHash);
	}
</script>

<div class="message card">
	<div class="message-header">
		<span class="message-meta">
			{#if showSender}
				<Address address={message.sender} showFull={true} href={ROUTES.PROFILE(message.sender)} />
				<span class="middot">·</span>
			{/if}
			<span class="timestamp"
				>{message.timestamp != null
					? showPermalink
						? formatTime(message.timestamp)
						: new Date(message.timestamp).toLocaleString()
					: 'BLOCK ' + message.blockNumber}</span
			>
		</span>
		<span class="message-actions">
			{#if showReply && onReply}
				<button class="reply-btn" onclick={() => onReply(message)} title="Reply">↩</button>
			{/if}
			{#if showPermalink}
				{#if showReply && onReply}<span class="middot">·</span>{/if}
				<a href={ROUTES.MESSAGE(message.txHash)} class="permalink">#</a>
			{/if}
		</span>
	</div>
	<div class="content-wrapper" class:truncated={truncate && !expanded} bind:this={contentEl}>
		<div class="message-text">{@html renderMarkdown(message.message)}</div>
		{#if truncate && !expanded && overflows}
			<div class="gradient-overlay"></div>
		{/if}
	</div>
	{#if truncate && !expanded && overflows}
		<div class="read-more">
			<button onclick={() => (expanded = true)}>MORE</button>
		</div>
	{/if}
	{#each reposts as [, bytes]}
		<div class="repost">
			{#await fetchRepost(bytes)}
				<div class="repost-loading">loading repost…</div>
			{:then reposted}
				<Message message={reposted} showPermalink={false} showReply={false} truncate={false} />
			{:catch}
				<div class="repost-error">repost not found</div>
			{/await}
		</div>
	{/each}
</div>

<style>
	.message {
		border: 1px solid var(--surface-alt);
	}
	.message-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
		font-size: 0.875rem;
	}
	.message-meta {
		display: flex;
		align-items: center;
		flex-shrink: 0;
	}
	.timestamp {
		color: var(--text-secondary);
		font-family: var(--font-mono);
	}
	.message-actions {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		flex-shrink: 0;
	}
	.permalink {
		font-size: 1rem;
		font-family: var(--font-mono);
	}
	.reply-btn {
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		font-size: 1.2rem;
		color: var(--primary);
		font-family: var(--font-mono);
	}
	.reply-btn:hover {
		text-decoration: underline;
		text-decoration-style: dotted;
	}
	.content-wrapper {
		position: relative;
	}
	.content-wrapper.truncated {
		max-height: 100vh;
		overflow: hidden;
	}
	.gradient-overlay {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 4rem;
		background: linear-gradient(transparent, var(--surface));
		pointer-events: none;
	}
	.read-more {
		text-align: center;
		margin-top: 0.5rem;
	}
	.read-more button {
		background: none;
		border: none;
		color: var(--primary);
		cursor: pointer;
		font-family: var(--font-mono);
		font-size: 0.85rem;
		font-weight: 600;
		padding: 0.25rem 0.5rem;
	}
	.read-more button:hover {
		text-decoration: underline;
		text-decoration-style: dotted;
	}
	.message-text {
		margin: 0;
		line-height: 1.5;
	}
	.repost {
		margin-top: 0.75rem;
		max-height: 15vh;
		overflow-y: auto;
		opacity: 0.8;
	}
	.repost-loading,
	.repost-error {
		font-size: 0.75rem;
		color: var(--text-secondary);
		font-family: var(--font-mono);
	}
</style>
