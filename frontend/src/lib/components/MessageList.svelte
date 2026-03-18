<script lang="ts">
	import { fly } from 'svelte/transition';
	import Message from './Message.svelte';
	import type { Message as MessageType } from '$lib/types';

	let {
		messages,
		loading = false,
		hasMore = false,
		loadingMore = false,
		showSender = true,
		emptyText = 'NO MESSAGES.',
		onLoadMore,
		onReply,
	}: {
		messages: MessageType[];
		loading?: boolean;
		hasMore?: boolean;
		loadingMore?: boolean;
		showSender?: boolean;
		emptyText?: string;
		onLoadMore?: () => void;
		onReply?: (message: MessageType) => void;
	} = $props();
</script>

{#if loading && messages.length === 0}
	<div class="loading">LOADING...</div>
{:else if messages.length === 0}
	<div class="empty">{emptyText}</div>
{:else}
	<div class="messages-list">
		{#each messages as message (message.txHash)}
			<div transition:fly={{ y: 6, duration: 200 }}>
				<Message {message} {showSender} {onReply} />
			</div>
		{/each}
	</div>
	{#if loading}
		<div class="loading">LOADING...</div>
	{:else if hasMore && onLoadMore}
		<div class="load-more">
			<button class="btn" onclick={onLoadMore} disabled={loadingMore}>
				{loadingMore ? 'LOADING...' : 'MORE'}
			</button>
		</div>
	{/if}
{/if}

<style>
	.loading,
	.empty {
		text-align: center;
		padding: 2rem;
		color: var(--text-secondary);
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
</style>
