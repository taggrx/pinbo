<script lang="ts">
	import { fade } from 'svelte/transition';
	import { type Message } from '$lib/types';
	import Address from './Address.svelte';
	import MessageList from './MessageList.svelte';

	interface Props {
		address: string;
		messages: Message[];
		loading: boolean;
		isConnected: boolean;
		onReply?: (message: Message) => void;
	}

	let { address, messages, loading, isConnected, onReply }: Props = $props();
</script>

<div class="profile-section" in:fade={{ duration: 150 }}>
	<div class="profile-header">
		<Address address={address as `0x${string}`} showFull={true} />
	</div>
	<MessageList
		{messages}
		{loading}
		showSender={false}
		emptyText="NO MESSAGES FROM THIS ADDRESS."
		onReply={isConnected ? onReply : undefined}
	/>
</div>

<style>
	.profile-section {
		margin-top: 1rem;
	}
	.profile-header {
		margin-bottom: 1.5rem;
		font-size: 1.1rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
</style>
