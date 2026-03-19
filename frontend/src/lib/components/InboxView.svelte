<script lang="ts">
	import { fade } from 'svelte/transition';
	import { type Message } from '$lib/types';
	import MessageList from './MessageList.svelte';

	interface Props {
		messages: Message[];
		loading: boolean;
		isConnected: boolean;
		onReply?: (message: Message) => void;
	}

	let { messages, loading, isConnected, onReply }: Props = $props();
</script>

<div class="profile-section" in:fade={{ duration: 150 }}>
	<h2 class="profile-header">INBOX</h2>
	<MessageList
		{messages}
		{loading}
		showSender={true}
		emptyText="NO MESSAGES ADDRESSED TO YOU YET."
		onReply={isConnected ? onReply : undefined}
	/>
</div>

<style>
	.profile-section {
		margin-top: 1rem;
	}
	.profile-header {
		margin-bottom: 1.5rem;
	}
</style>
