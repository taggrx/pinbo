<script lang="ts">
	import { connect, disconnect } from '$lib/ethereum';
	import { ROUTES, type Message } from '$lib/types';
	import Address from './Address.svelte';

	interface Props {
		isConnected: boolean;
		account: string | null;
		dmCount: number;
		showPostForm: boolean;
		showAbout: boolean;
		showInbox: boolean;
		profileAddress: string | null;
		permalinkMessage: Message | null;
		onTogglePostForm: () => void;
		onMessageTo: (address: string) => void;
		onReply: (message: Message) => void;
	}

	let {
		isConnected,
		account,
		dmCount,
		showPostForm,
		showAbout,
		showInbox,
		profileAddress,
		permalinkMessage,
		onTogglePostForm,
		onMessageTo,
		onReply,
	}: Props = $props();

	function handleAction() {
		if (profileAddress) onMessageTo(profileAddress);
		else if (permalinkMessage) onReply(permalinkMessage);
		else onTogglePostForm();
	}

	const actionLabel = $derived(profileAddress ? 'DM' : permalinkMessage ? 'REPLY' : 'POST');
	const fabLabel = $derived(profileAddress ? '✉' : permalinkMessage ? '↩' : '+');
</script>

<header class="header">
	<h1 class="logo">
		<button onclick={() => (window.location.hash = '')}>
			<img src="favicon.svg" width="26" height="26" alt="" aria-hidden="true" />
			PINBO
		</button>
	</h1>
	<div class="wallet-section">
		<a href={ROUTES.ABOUT} class="about-link">ABOUT</a>
		{#if isConnected}
			<span class="middot">·</span>
			<div class="connected">
				<Address address={account!} href={ROUTES.INBOX} />{#if dmCount > 0}<span class="dm-count">[{dmCount}]</span>{/if}
				{#if showInbox}
					<button class="btn post-btn btn-logout" onclick={disconnect}>LOGOUT</button>
				{:else}
					<button class="btn post-btn" onclick={handleAction} disabled={showAbout}>
						{actionLabel}
					</button>
				{/if}
			</div>
			<button
				class="btn post-fab"
				onclick={handleAction}
				disabled={showAbout}
				style:display={showPostForm ? 'none' : ''}
			>{fabLabel}</button>
		{:else}
			<button class="btn connect" onclick={connect}>CONNECT WALLET</button>
		{/if}
	</div>
</header>

<style>
	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 2rem 0;
		border-bottom: 1px solid var(--surface-alt);
		margin-bottom: 2rem;
	}
	.logo {
		font-size: 1.4rem;
		font-weight: 800;
		color: var(--orange);
		margin: 0;
		font-family: system-ui, sans-serif;
	}
	.logo button {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		color: inherit;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		font: inherit;
		line-height: 1;
	}
	.logo button:hover {
		opacity: 0.8;
	}
	.wallet-section {
		display: flex;
		align-items: center;
		gap: var(--sep-gap);
	}
	.connected {
		display: flex;
		align-items: center;
		gap: var(--sep-gap);
		font-size: var(--text-sm);
	}
	.dm-count {
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--text-sm);
	}
	.about-link {
		color: var(--text-secondary);
		text-decoration: none;
		font-size: var(--text-sm);
	}
	.about-link:hover {
		color: var(--primary);
	}
	.post-btn {
		margin-left: 0.5rem;
		min-width: 5.5rem;
		text-align: center;
	}
	.post-fab {
		display: none;
	}
	@media (max-width: 600px) {
		.post-btn {
			display: none;
		}
		.post-fab {
			display: flex;
			align-items: center;
			justify-content: center;
			position: fixed;
			bottom: 1.5rem;
			right: 1.5rem;
			width: 3.5rem;
			height: 3.5rem;
			border-radius: 50%;
			background-color: var(--secondary);
			color: var(--bg0);
			font-size: 1.75rem;
			border: none;
			cursor: pointer;
			box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
			z-index: 100;
		}
		.post-fab:disabled {
			opacity: 0.4;
			cursor: not-allowed;
		}
	}
	.btn.connect,
	.btn.post-btn {
		background-color: var(--secondary);
	}
	.btn.btn-logout {
		background-color: var(--error);
		color: var(--bg0);
	}
</style>
