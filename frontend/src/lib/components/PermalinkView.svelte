<script lang="ts">
	import { fade } from 'svelte/transition';
	import { type Message } from '$lib/types';
	import MessageComponent from './Message.svelte';
	import PostForm from './PostForm.svelte';

	interface Props {
		message: Message | null;
		loading: boolean;
		isConnected: boolean;
		wrongNetwork: boolean;
		showPostForm: boolean;
		newMessage: string;
		posting: boolean;
		fee?: bigint | null;
		onPost: () => void;
		onCloseForm: () => void;
	}

	let {
		message,
		loading,
		isConnected,
		wrongNetwork,
		showPostForm,
		newMessage = $bindable(),
		posting,
		fee = null,
		onPost,
		onCloseForm,
	}: Props = $props();
</script>

{#if loading}
	<div class="loading" in:fade={{ duration: 150 }}>LOADING...</div>
{:else if message}
	<div in:fade={{ duration: 150 }}>
		<MessageComponent {message} showPermalink={false} showReply={false} truncate={false} />
		<div class="permalink-tx">
			<a
				href={`https://etherscan.io/tx/${message.txHash}`}
				target="_blank"
				rel="noopener noreferrer">BLOCKCHAIN TRANSACTION</a
			>
		</div>
		{#if isConnected && !wrongNetwork && showPostForm}
			<PostForm
				bind:value={newMessage}
				{posting}
				{fee}
				isReply={true}
				onSubmit={onPost}
				onClose={onCloseForm}
			/>
		{/if}
	</div>
{/if}

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
	.permalink-tx {
		text-align: center;
		margin: 2rem 0 1rem;
		font-size: var(--text-xs);
		font-family: var(--font-mono);
		color: var(--text-secondary);
		word-break: break-all;
	}
</style>
