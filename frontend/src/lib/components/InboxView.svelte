<script lang="ts">
	import { fade } from 'svelte/transition';
	import { type Message } from '$lib/types';
	import UserBadge from './UserBadge.svelte';
	import MessageList from './MessageList.svelte';

	interface Props {
		address: string;
		messages: Message[];
		loading: boolean;
		isOwn?: boolean;
		onReply?: (message: Message) => void;
	}

	let { address, messages, loading, isOwn = false, onReply }: Props = $props();
</script>

<div class="inbox-section" in:fade={{ duration: 150 }}>
	<div class="inbox-header">
		{#if isOwn}
			<span>YOUR INBOX</span>
		{:else}
			<span>INBOX OF<UserBadge address={address as `0x${string}`} showFull={true} /></span>
		{/if}
	</div>
	<MessageList
		{messages}
		{loading}
		emptyText="NO MESSAGES ADDRESSED TO THIS ADDRESS."
		{onReply}
	/>
</div>

<style>
	.inbox-section {
		margin-top: 1rem;
	}
	.inbox-header {
		margin-bottom: 1.5rem;
		font-size: 1.1rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
	.inbox-header span {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
</style>
