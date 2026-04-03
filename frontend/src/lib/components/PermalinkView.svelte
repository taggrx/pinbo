<script lang="ts">
	import { fade } from 'svelte/transition';
	import { type Message } from '$lib/types';
	import MessageComponent from './Message.svelte';

	interface Props {
		message: Message | null;
		loading: boolean;
		onReply?: (message: Message) => void;
	}

	let { message, loading, onReply }: Props = $props();
</script>

{#if loading}
	<div class="loading" in:fade={{ duration: 150 }}>Loading…</div>
{:else if message}
	<div in:fade={{ duration: 150 }}>
		<MessageComponent {message} truncate={false} {onReply} />
	</div>
{/if}

<style>
	.loading {
		min-height: 200px;
		display: flex;
		justify-content: center;
		align-items: center;
	}
</style>
