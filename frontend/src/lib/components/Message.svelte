<script lang="ts">
	import { ROUTES, type Message as MessageType } from '$lib/types';
	import UserBadge from './UserBadge.svelte';
	import MarkdownContent from './MarkdownContent.svelte';
	import { getMessageByTxHash, TOPIC_TYPE } from '$lib/ethereum';
	import { bytesToHex } from 'viem';
	import Message from './Message.svelte';

	interface Props {
		message: MessageType;
		truncate?: boolean;
		onReply?: (message: MessageType) => void;
	}

	let { message, truncate = true, onReply }: Props = $props();

	let contentEl = $state<HTMLElement | null>(null);
	let expanded = $state(false);
	let overflows = $state(false);

	$effect(() => {
		if (!contentEl || !truncate || expanded) return;
		const check = () => {
			overflows = contentEl!.scrollHeight > contentEl!.clientHeight + 1;
		};
		check();
		const observer = new ResizeObserver(check);
		observer.observe(contentEl);
		return () => observer.disconnect();
	});

	const reposts = $derived((message.topics ?? []).filter(([type]) => type === TOPIC_TYPE.REPOST));
	const recipientBytes = $derived(
		(message.topics ?? []).find(([type]) => type === TOPIC_TYPE.ADDRESS)?.[1] ?? null
	);
	const recipientAddress = $derived(
		recipientBytes ? (bytesToHex(recipientBytes) as `0x${string}`) : null
	);

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

	// window.location.hash is not reactive, but that's fine: each Message instance is
	// created for a specific hash route and won't survive a navigation, so this only
	// needs to be correct at mount time.
	const isPermalink = $derived(window.location.hash === ROUTES.MESSAGE(message.txHash));

	function handleCardClick(e: MouseEvent) {
		if (isPermalink) return;
		if ((e.target as HTMLElement).closest('a, button')) return;
		window.location.hash = ROUTES.MESSAGE(message.txHash);
	}

	async function handleShare() {
		const url = window.location.origin + window.location.pathname + ROUTES.MESSAGE(message.txHash);
		if (navigator.share) {
			await navigator.share({ url });
		} else {
			await navigator.clipboard.writeText(url);
		}
	}
</script>

<div class="message card" class:clickable={!isPermalink} onclick={handleCardClick}>
	<div class="message-header">
		<span class="message-meta">
			<UserBadge address={message.sender} showFull={true} href={ROUTES.PROFILE(message.sender)} />
			{#if recipientAddress}
				<span class="to-arrow">→</span>
				<UserBadge
					address={recipientAddress}
					showFull={true}
					href={ROUTES.PROFILE(recipientAddress)}
				/>
			{/if}
		</span>
		<span class="timestamp"
			>{message.timestamp != null
				? formatTime(message.timestamp)
				: 'BLOCK ' + message.blockNumber}</span
		>
	</div>
	<div
		class="content-wrapper"
		class:truncated={truncate && !expanded}
		bind:this={contentEl}
		style:font-size="{Math.max(1, 1.5 - message.message.length / 500)}em"
	>
		<MarkdownContent text={message.message} />
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
				<Message message={reposted} truncate={false} />
			{:catch}
				<div class="repost-error">repost not found</div>
			{/await}
		</div>
	{/each}
	<div class="message-footer">
		<a
			class="footer-action"
			href={`https://etherscan.io/tx/${message.txHash}`}
			target="_blank"
			rel="noopener noreferrer">TX</a
		>
		<span class="middot">·</span>
		<button class="footer-action" onclick={handleShare}>SHARE</button>
		{#if onReply}
			<span class="middot">·</span>
			<button class="footer-action" onclick={() => onReply!(message)}>REPLY</button>
		{/if}
	</div>
</div>

<style>
	.message {
		border: 1px solid var(--surface-alt);
	}
	.message.clickable {
		cursor: pointer;
	}
	.message.clickable:hover {
		border-color: var(--bg4);
	}
	.message-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: var(--text-sm);
	}
	.message-meta {
		display: flex;
		align-items: center;
		flex-shrink: 0;
		gap: var(--sep-gap);
	}
	.to-arrow {
		color: var(--text-secondary);
		font-size: var(--text-sm);
	}
	.timestamp {
		color: var(--text-secondary);
		font-family: var(--font-mono);
	}
	.content-wrapper {
		position: relative;
	}
	.content-wrapper.truncated {
		max-height: 80vh;
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
		font-size: var(--text-sm);
		font-weight: 600;
		padding: 0.25rem 0.5rem;
	}
	.read-more button:hover {
		text-decoration: underline;
		text-decoration-style: dotted;
	}
	.repost {
		margin-top: var(--text-xs);
		max-height: 15vh;
		overflow-y: auto;
		opacity: 0.8;
	}
	.repost-loading,
	.repost-error {
		font-size: var(--text-xs);
		color: var(--text-secondary);
		font-family: var(--font-mono);
	}
	.message-footer {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--sep-gap);
		font-size: var(--text-xs);
		font-family: var(--font-mono);
		margin-top: 0.75rem;
	}
	.footer-action {
		background: none;
		border: none;
		padding: 0;
		color: var(--text-secondary);
		cursor: pointer;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
	}
	.footer-action:hover {
		color: var(--primary);
		text-decoration: underline;
		text-decoration-style: dotted;
	}
</style>
