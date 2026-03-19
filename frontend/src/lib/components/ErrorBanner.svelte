<script lang="ts">
	import { fade } from 'svelte/transition';

	interface Props {
		globalError?: string | null;
		wrongNetwork?: boolean;
		chainName?: string;
		onDismiss?: () => void;
	}

	let { globalError = null, wrongNetwork = false, chainName = '', onDismiss }: Props = $props();
</script>

{#if globalError}
	<div class="error-banner" role="alert" transition:fade={{ duration: 150 }}>
		{globalError}
		<button class="error-close" onclick={onDismiss}>✕</button>
	</div>
{/if}

{#if wrongNetwork}
	<div class="error-banner" role="alert" transition:fade={{ duration: 150 }}>
		Wrong network — please switch your wallet to {chainName}.
	</div>
{/if}

<style>
	.error-banner {
		background: var(--bg-red);
		color: var(--error);
		padding: 0.75rem 1rem;
		border-radius: 0.375rem;
		margin-bottom: 1rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: var(--text-sm);
	}
	.error-close {
		background: none;
		border: none;
		color: var(--error);
		cursor: pointer;
		font-size: var(--text-sm);
		padding: 0 0.25rem;
	}
</style>
