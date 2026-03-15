<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { account, isConnected, connect, disconnect, autoConnect, fetchMessages, postMessage, watchMessages, getMessageByTxHash } from '$lib/ethereum';
  import { fade } from 'svelte/transition';
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';

  let messages = $state<any[]>([]);
  let newMessage = $state('');
  let posting = $state(false);
  let pendingTxHash = $state<string | null>(null);
  let loading = $state(true);
  let unwatch: (() => void) | null = null;
  let permalinkMessage = $state<any | null>(null);

  function getMessageLink(txHash: string) {
    return `#/message/${txHash}`;
  }

  async function handleHashChange() {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    const match = hash.match(/^#\/message\/(0x[a-fA-F0-9]{64})$/);
    if (match) {
      try {
        permalinkMessage = await getMessageByTxHash(match[1] as `0x${string}`);
      } catch (e) {
        permalinkMessage = null;
      }
    } else {
      permalinkMessage = null;
    }
  }

  onMount(async () => {
    await autoConnect();
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    try {
      messages = await fetchMessages();
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    } finally {
      loading = false;
    }

    unwatch = watchMessages((message) => {
      messages = [message, ...messages];
      // Clear pendingTxHash if this is the transaction we're waiting for
      if (pendingTxHash && message.txHash === pendingTxHash) {
        pendingTxHash = null;
      }
    });
  });

  onDestroy(() => {
    if (unwatch) unwatch();
    if (typeof window !== 'undefined') {
      window.removeEventListener('hashchange', handleHashChange);
    }
  });

  async function handlePost() {
    if (!newMessage.trim() || posting) return;
    posting = true;
    try {
      const txHash = await postMessage(newMessage.trim());
      pendingTxHash = txHash;
      newMessage = '';
      // Clear pendingTxHash after 60 seconds if event not received
      setTimeout(() => {
        if (pendingTxHash === txHash) {
          pendingTxHash = null;
        }
      }, 60000);
    } catch (err) {
      alert('Failed to post message: ' + (err as Error).message);
      pendingTxHash = null;
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

  function renderMarkdown(text: string): string {
    const html = marked.parse(text, { async: false }) as string;
    return DOMPurify.sanitize(html);
  }
</script>

<div class="container">
  <header class="header">
    <h1 class="logo"><a href="#" onclick={() => permalinkMessage = null}>PINBO</a></h1>
    <div class="wallet-section">
      {#if $isConnected}
        <div class="connected">
          <a href={getEtherscanLink($account!)} class="address" target="_blank" rel="noopener noreferrer">{formatAddress($account!)}</a>
          <button class="btn disconnect" onclick={disconnect}>DISCONNECT</button>
        </div>
      {:else}
        <button class="btn connect" onclick={connect}>CONNECT WALLET</button>
      {/if}
    </div>
  </header>

  <main>
    {#if $isConnected && !permalinkMessage}
      {#if pendingTxHash}
        <div class="loading">LOADING...</div>
      {:else}
        <div class="post-section card">
          <h2>POST A MESSAGE</h2>
          <div class="input-group">
            <textarea
              class="input"
              bind:value={newMessage}
              rows="3"
            ></textarea>
            <button class="btn" onclick={handlePost} disabled={posting || !newMessage.trim()}>
              {posting ? 'POSTING...' : 'POST'}
            </button>
          </div>
        </div>
      {/if}
    {/if}

    {#if permalinkMessage}
      <div class="message card">
        <div class="message-header">
          <a href={getEtherscanLink(permalinkMessage.sender)} class="sender" target="_blank" rel="noopener noreferrer">{formatAddress(permalinkMessage.sender)}</a>
          <span class="timestamp">{permalinkMessage.timestamp ? formatTime(permalinkMessage.timestamp) : 'BLOCK ' + permalinkMessage.blockNumber}</span>
        </div>
        <div class="message-text">{@html renderMarkdown(permalinkMessage.message)}</div>
      </div>
    {:else}
    <div class="messages-section">
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
                <span class="message-meta">
                  <span class="timestamp">{formatTime(message.timestamp)}</span>
                  <span class="middot">·</span>
                  <a href={getMessageLink(message.txHash)} class="permalink">PERMALINK</a>
                </span>
              </div>
              <div class="message-text">{@html renderMarkdown(message.message)}</div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
    {/if}
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
  .logo a {
    color: inherit;
    text-decoration: none;
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
  main > .loading {
    margin: 2rem auto;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 200px;
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
    flex-shrink: 0;
  }
  .sender:hover {
    text-decoration: underline;
    text-decoration-style: dotted;
  }
  .timestamp {
    color: var(--text-secondary);
  }
  .message-meta {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }
  .middot {
    color: var(--text-secondary);
    margin: 0 0.25rem;
  }
  .permalink {
    font-size: 0.75rem;
  }
  .message-text {
    margin: 0;
    line-height: 1.5;
  }
</style>