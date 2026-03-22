<script lang="ts">
	import { slide } from 'svelte/transition';
	import { formatEther, isAddress } from 'viem';
	import TuiEditor from './TuiEditor.svelte';

	interface Props {
		value: string;
		posting: boolean;
		fee?: bigint | null;
		toAddress?: string;
		toAddressLocked?: boolean;
		isReply?: boolean;
		onSubmit: () => void;
		onClose: () => void;
	}

	let {
		value = $bindable(),
		posting,
		fee = null,
		toAddress = '',
		toAddressLocked = false,
		isReply = false,
		onSubmit,
		onClose,
	}: Props = $props();

	const toAddressValid = $derived(toAddress.trim() === '' || isAddress(toAddress.trim()));
</script>

<div class="post-section" transition:slide={{ duration: 200 }}>
	<div class="input-group">
		{#if toAddressLocked}
			<div class="to-field">
				<span class="to-label">TO:</span>
				<input class="to-input" value={toAddress} disabled spellcheck="false" />
			</div>
		{/if}
		<TuiEditor bind:value placeholder={isReply ? 'Write a reply…' : "What's on your mind?"} />
		<div class="btn-row">
			<button class="btn btn-secondary" onclick={onClose}>CLOSE</button>
			<button class="btn" onclick={onSubmit} disabled={posting || !value.trim() || !toAddressValid}>
				{posting ? (isReply ? 'REPLYING' : 'SENDING') : isReply ? 'REPLY' : 'SEND'}
			</button>
		</div>
		{#if fee !== null}
			<div class="fee-info">Fee: {formatEther(fee)} ETH + gas</div>
		{/if}
	</div>
</div>

<style>
	.post-section {
		margin-bottom: 2rem;
		padding: 1rem 0;
	}
	.input-group {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.to-field {
		display: flex;
		align-items: center;
		gap: var(--text-xs);
	}
	.to-label {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--text-secondary);
		flex-shrink: 0;
	}
	.to-input {
		flex: 1;
		background: var(--bg2);
		border: 1px solid var(--surface-alt);
		border-radius: 0.375rem;
		color: var(--text);
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		padding: 0.375rem 0.625rem;
		outline: none;
	}
	.to-input:focus {
		border-color: var(--primary);
	}
	.fee-info {
		font-size: var(--text-sm);
		color: var(--text-secondary);
		font-family: var(--font-mono);
		text-align: right;
	}
	.btn-row {
		display: flex;
		gap: 0.5rem;
	}
	.btn-row .btn {
		flex: 1;
	}
	.btn-secondary {
		background: var(--bg-dim);
		border: 1px solid var(--bg-dim);
		color: var(--text-secondary);
	}
	.btn-secondary:hover {
		border-color: var(--text-secondary);
	}
</style>
