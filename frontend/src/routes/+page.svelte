<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { account, isConnected, connect, disconnect, fetchMessages, postMessage, watchMessages } from '$lib/ethereum';
  import { fade } from 'svelte/transition';

  let messages = $state<any[]>([]);
  let newMessage = $state('');
  let posting = $state(false);
  let loading = $state(true);
  let unwatch: (() => void) | null = null;

  onMount(async () => {
    try {
      messages = await fetchMessages();
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    } finally {
      loading = false;
    }

    unwatch = watchMessages((message) => {
      messages = [message, ...messages];
    });
  });

  onDestroy(() => {
    if (unwatch) unwatch();
  });

  async function handlePost() {
    if (!newMessage.trim() || posting) return;
    posting = true;
    try {
      await postMessage(newMessage.trim());
      newMessage = '';
    } catch (err) {
      console.error('Failed to post message:', err);
      alert('Failed to post message: ' + (err as Error).message);
    } finally {
      posting = false;
    }
  }

  function formatAddress(addr: string) {
    return addr.slice(0, 6) + '...' + addr.slice(-4);
  }

  function getEtherscanLink(addr: string) {
    return `https://etherscan.io/address/${addr}`;
  }

  function formatTime(timestamp: number) {
    return new Date(timestamp).toLocaleString();
  }
</script>

<div class="container">
  <header class="header">
    <h1 class="logo">PINBO</h1>
    <div class="wallet-section">
      {#if $isConnected}
        <div class="connected">
          <a href={getEtherscanLink($account!)} class="address" target="_blank" rel="noopener noreferrer">{formatAddress($account!)}</a>
          <button class="btn disconnect" on:click={disconnect}>DISCONNECT</button>
        </div>
      {:else}
        <button class="btn connect" on:click={connect}>CONNECT WALLET</button>
      {/if}
    </div>
  </header>

  <main>
    {#if $isConnected}
      <div class="post-section card">
        <h2>POST A MESSAGE</h2>
        <div class="input-group">
          <textarea
            class="input"
            bind:value={newMessage}
            placeholder="WHAT'S ON YOUR MIND?"
            rows="3"
            maxlength="280"
          ></textarea>
          <button class="btn" on:click={handlePost} disabled={posting || !newMessage.trim()}>
            {posting ? 'POSTING...' : 'POST'}
          </button>
        </div>
      </div>
    {:else}
      <div class="card text-center">
        <h2>CONNECT YOUR WALLET TO POST MESSAGES</h2>
        <p>USE METAMASK OR WALLETCONNECT TO CONNECT TO THE LOCAL ANVIL NETWORK.</p>
      </div>
    {/if}

    <div class="messages-section">
      <h2>RECENT MESSAGES</h2>
      {#if loading}
        <div class="loading">LOADING MESSAGES...</div>
      {:else if messages.length === 0}
        <div class="empty">NO MESSAGES YET. BE THE FIRST TO POST!</div>
      {:else}
        <div class="messages-list">
          {#each messages as message (message.blockNumber)}
            <div class="message card" transition:fade>
              <div class="message-header">
                <a href={getEtherscanLink(message.sender)} class="sender" target="_blank" rel="noopener noreferrer">{formatAddress(message.sender)}</a>
                <span class="timestamp">{formatTime(message.timestamp)}</span>
              </div>
              <p class="message-text">{message.message}</p>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </main>
</div>

<style>
  :global(body) {
    font-family: 'Iosevka Charon', monospace;
    font-weight: 600;
    font-size: 1.05rem;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 2rem 0;
    border-bottom: 1px solid var(--surface-alt);
    margin-bottom: 2rem;
  }
  .logo {
    font-size: 2.5rem;
    font-weight: 800;
    color: var(--primary);
    margin: 0;
  }
  .wallet-section {
    display: flex;
    align-items: center;
  }
  .connected {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  .address {
    background-color: var(--surface-alt);
    padding: 0.5rem 1rem;
    border-radius: 0.375rem;
    text-decoration: none;
    color: var(--primary);
  }
  .address:hover {
    text-decoration: underline;
    text-decoration-style: dotted;
  }
  .btn {
    background-color: var(--primary);
    color: var(--bg0);
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 0.375rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.2s;
    font-family: inherit;
  }
  .btn:hover {
    opacity: 0.9;
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .btn.disconnect {
    background-color: var(--error);
  }
  .btn.connect {
    background-color: var(--secondary);
  }
  .post-section {
    margin-bottom: 2rem;
  }
  .input-group {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  textarea.input {
    min-height: 80px;
    resize: vertical;
    font-family: inherit;
    font-size: 1rem;
  }
  .messages-section h2 {
    margin-bottom: 1rem;
  }
  .loading, .empty {
    text-align: center;
    padding: 2rem;
    color: var(--text-secondary);
  }
  .messages-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .message-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
    font-size: 0.875rem;
  }
  .sender {
    font-weight: 600;
    color: var(--primary);
    text-decoration: none;
  }
  .sender:hover {
    text-decoration: underline;
    text-decoration-style: dotted;
  }
  .timestamp {
    color: var(--text-secondary);
  }
  .message-text {
    margin: 0;
    line-height: 1.5;
  }
</style>