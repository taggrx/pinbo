<script lang="ts">
	import { fade } from 'svelte/transition';
	import { type Message, ROUTES } from '$lib/types';
	import { type AddressInfo } from '$lib/ethereum';
	import UserBadge from './UserBadge.svelte';
	import MessageList from './MessageList.svelte';

	interface Props {
		address: string;
		messages: Message[];
		loading: boolean;
		isConnected: boolean;
		info: AddressInfo | null;
		onReply?: (message: Message) => void;
	}

	let { address, messages, loading, isConnected, info, onReply }: Props = $props();

	function formatBalance(eth: string): string {
		const n = parseFloat(eth);
		if (n === 0) return '0';
		if (n < 0.0001) return '<0.0001';
		return n.toFixed(4).replace(/\.?0+$/, '');
	}
</script>

<div class="profile-section" in:fade={{ duration: 150 }}>
	<div class="profile-header">
		<div class="profile-left">
			{#if info}
				<span class="kind">{info.isContract ? 'CONTRACT' : 'USER'}</span>
			{/if}
			<UserBadge address={address as `0x${string}`} showFull={true} />
			{#if info?.isContract && (info.name || info.symbol)}
				<span class="contract-name">
					{[info.name, info.symbol ? `(${info.symbol})` : ''].filter(Boolean).join(' ')}
				</span>
			{/if}
		</div>
		{#if info}
			<div class="profile-right">
				<span class="balance">Ξ {formatBalance(info.balanceEth)}</span>
				<span class="middot">·</span>
				<a href={ROUTES.INBOX_OF(address)} class="inbox-link">INBOX</a>
			</div>
		{/if}
	</div>
	<MessageList
		{messages}
		{loading}
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
		justify-content: space-between;
		gap: 1rem;
	}
	.profile-left {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}
	.kind {
		color: var(--text-secondary);
		font-family: var(--font-mono);
	}
	.contract-name {
		font-size: var(--text-sm);
		color: var(--text-secondary);
	}
	.profile-right {
		display: flex;
		align-items: center;
		gap: var(--sep-gap);
		white-space: nowrap;
	}
	.balance {
		font-size: var(--text-sm);
		color: var(--text-secondary);
		font-family: var(--font-mono);
	}
	.inbox-link {
		font-size: var(--text-sm);
		color: var(--text-secondary);
		text-decoration: none;
	}
	.inbox-link:hover {
		color: var(--primary);
	}
</style>
