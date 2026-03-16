<script lang="ts">
	import { ROUTES } from '$lib/types';
	import Address from './Address.svelte';
	import { marked } from 'marked';

	interface Props {
		message: {
			sender: string;
			message: string;
			timestamp?: number;
			blockNumber: bigint;
			txHash: string;
		};
		showPermalink?: boolean;
	}

	let { message, showPermalink = true }: Props = $props();

	function formatTime(timestamp: number) {
		return new Date(timestamp).toLocaleString();
	}

	function renderMarkdown(text: string): string {
		const html = marked.parse(text, { async: false }) as string;
		return html;
	}
</script>

<div class="message card">
	<div class="message-header">
		<Address address={message.sender} showFull={true} />
		<span class="message-meta">
			<span class="timestamp"
				>{message.timestamp ? formatTime(message.timestamp) : 'BLOCK ' + message.blockNumber}</span
			>
			{#if showPermalink}
				<span class="middot">·</span>
				<a href={ROUTES.MESSAGE(message.txHash)} class="permalink">PERMALINK</a>
			{/if}
		</span>
	</div>
	<div class="message-text">{@html renderMarkdown(message.message)}</div>
</div>

<style>
	.message {
		padding: 1rem;
		border: 1px solid var(--surface-alt);
		border-radius: 0.5rem;
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
	.middot {
		color: var(--text-secondary);
		margin: 0 0.25rem;
	}
	.timestamp {
		color: var(--text-secondary);
		font-family: monospace;
	}
	.permalink {
		font-size: 0.75rem;
		font-family: monospace;
	}
	.message-text {
		margin: 0;
		line-height: 1.5;
	}
	.message-text :global(img) {
		max-width: 100%;
		height: auto;
	}
</style>
