<script lang="ts">
	import { connect, disconnect } from '$lib/ethereum';
	import { ROUTES, type Message } from '$lib/types';
	import UserBadge from './UserBadge.svelte';

	interface Props {
		isConnected: boolean;
		account: string | null;
		dmCount: number;
		showPostForm: boolean;
		showAbout: boolean;
		showLogout: boolean;
		profileAddress: string | null;
		permalinkMessage: Message | null;
		onTogglePostForm: () => void;
		onMessageTo: (address: string) => void;
	}

	let {
		isConnected,
		account,
		dmCount,
		showPostForm,
		showAbout,
		showLogout,
		profileAddress,
		permalinkMessage,
		onTogglePostForm,
		onMessageTo,
	}: Props = $props();

	function handleAction() {
		if (profileAddress) onMessageTo(profileAddress);
		else onTogglePostForm();
	}

	const actionLabel = $derived(profileAddress ? 'DM' : 'POST');
	const fabLabel = $derived(profileAddress ? '✉' : '+');
</script>

<header class="header">
	<h1 class="logo">
		<button onclick={() => (window.location.hash = '')}>
			<img src="favicon.svg" width="26" height="26" alt="" aria-hidden="true" />
			PINBO
		</button>
		<a href={ROUTES.ABOUT} class="about-btn" aria-label="About"><sup>?</sup></a>
	</h1>
	<div class="wallet-section">
		{#if isConnected}
			<div class="connected">
				{#if showLogout}
					<button class="btn post-btn btn-logout" onclick={disconnect}>LOGOUT</button>
				{:else}
					<UserBadge address={account!} href={ROUTES.INBOX_OF(account!)} />{#if dmCount > 0}<a
							href={ROUTES.INBOX_OF(account!)}
							class="dm-count">[{dmCount}]</a
						>{/if}
					{#if !permalinkMessage}
						<button class="btn post-btn" onclick={handleAction} disabled={showAbout}>
							{actionLabel}
						</button>
					{/if}
				{/if}
			</div>
			{#if !permalinkMessage}
				<button
					class="btn post-fab"
					onclick={handleAction}
					disabled={showAbout}
					style:display={showPostForm ? 'none' : ''}>{fabLabel}</button
				>
			{/if}
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
		display: flex;
		align-items: center;
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
		text-decoration: none;
	}
	.dm-count:hover {
		color: var(--primary);
	}
	.about-btn {
		color: var(--text-secondary);
		text-decoration: none;
		font-size: 1.1rem;
		font-weight: 700;
		line-height: 1;
		margin-left: 0.35rem;
		opacity: 0.6;
	}
	.about-btn:hover {
		opacity: 1;
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
		.post-btn:not(.btn-logout) {
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
