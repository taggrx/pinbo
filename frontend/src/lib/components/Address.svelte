<script lang="ts">
  import { resolveEns } from '$lib/ethereum';

  interface Props {
    address: string;
    showFull?: boolean;
  }

  let { address, showFull = false }: Props = $props();

  let ensName = $state<string | null>(null);
  let loading = $state(true);

  $effect(() => {
    loading = true;
    resolveEns(address as `0x${string}`).then((name) => {
      ensName = name;
      loading = false;
    }).catch(() => {
      ensName = null;
      loading = false;
    });
  });

  function getDisplayName() {
    if (ensName) return ensName;
    if (showFull) return address.slice(0, 6) + '...' + address.slice(-4);
    return '0x' + address.slice(2, 6);
  }

  function getEtherscanLink() {
    return `https://etherscan.io/address/${address}`;
  }
</script>

<a href={getEtherscanLink()} class="address-link" target="_blank" rel="noopener noreferrer">
  {#if loading}
    <span class="loading">0x{address.slice(2, 6)}</span>
  {:else}
    {getDisplayName()}
  {/if}
</a>

<style>
  .address-link {
    color: var(--primary);
    text-decoration: none;
  }
  .address-link:hover {
    text-decoration: underline;
    text-decoration-style: dotted;
  }
  .loading {
    color: var(--text-secondary);
  }
</style>
