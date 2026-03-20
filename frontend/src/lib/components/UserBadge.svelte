<script lang="ts">
	import { resolveEnsInfo } from '$lib/ethereum';
	import { create as makeBlockie } from 'blockies-ts';

	interface Props {
		address: string;
		showFull?: boolean;
		href?: string;
	}

	let { address, showFull = false, href }: Props = $props();

	let ensName = $state<string | null>(null);
	let ensAvatar = $state<string | null>(null);
	let loading = $state(true);

	$effect(() => {
		loading = true;
		ensName = null;
		ensAvatar = null;
		resolveEnsInfo(address as `0x${string}`)
			.then(({ name, avatar }) => {
				ensName = name;
				ensAvatar = avatar;
				loading = false;
			})
			.catch(() => {
				loading = false;
			});
	});

	function getDisplayName() {
		if (ensName) return ensName;
		if (showFull) return address.slice(0, 6) + '…' + address.slice(-4);
		return '0x' + address.slice(2, 6);
	}

	function getEtherscanLink() {
		return href ?? `https://etherscan.io/address/${address}`;
	}

	function getBlockie() {
		return makeBlockie({ seed: address.toLowerCase(), size: 8, scale: 3 }).toDataURL();
	}
</script>

<a href={getEtherscanLink()} class="address-link" target={href ? undefined : '_blank'} rel={href ? undefined : 'noopener noreferrer'}>
	<img src={ensAvatar ?? getBlockie()} alt="" class="blockie" />
	{#if loading}
		<span class="loading">0x{address.slice(2, 6)}</span>
	{:else}
		<span>{getDisplayName()}</span>
	{/if}
</a>

<style>
	.address-link {
		display: inline-flex;
		flex-direction: row;
		align-items: center;
		gap: 0.4rem;
		color: var(--primary);
		text-decoration: none;
		font-family: var(--font-mono);
	}
	.blockie {
		width: 18px;
		height: 18px;
		border-radius: 0.25rem;
		flex-shrink: 0;
		outline: 1px solid var(--background);
	}
	.address-link:hover {
		text-decoration: underline;
		text-decoration-style: dotted;
	}
	.loading {
		color: var(--text-secondary);
	}
</style>
