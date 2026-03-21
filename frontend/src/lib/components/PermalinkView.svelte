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
		onReply: (message: Message) => void;
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
		onReply,
	}: Props = $props();
</script>

{#if loading}
	<div class="loading" in:fade={{ duration: 150 }}>LOADING...</div>
{:else if message}
	<div in:fade={{ duration: 150 }}>
		<MessageComponent {message} truncate={false} onReply={isConnected && !wrongNetwork ? onReply : undefined} />
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
</style>
