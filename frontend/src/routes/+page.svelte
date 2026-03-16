<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { account, isConnected, connect, disconnect, autoConnect, postMessage, watchMessages, getMessageByTxHash, createMessageLoader } from '$lib/ethereum';
  import { fade } from 'svelte/transition';
  import { marked } from 'marked';
  import Address from '$lib/components/Address.svelte';
  import Message from '$lib/components/Message.svelte';
  import TuiEditor from '$lib/components/TuiEditor.svelte';
  import { ROUTES, type Message as MessageType } from '$lib/types';
  import readme from '../../../README.md?raw';

  let aboutContent = $state('');
  
  if (browser) {
    import('dompurify').then((module) => {
      const DOMPurify = module.default;
      aboutContent = DOMPurify.sanitize(marked.parse(readme, { async: false }) as string);
    });
  }

  let messages = $state<MessageType[]>([]);
  let newMessage = $state('');
  let posting = $state(false);
  let pendingTxHash = $state<string | null>(null);
  let loading = $state(true);
  let unwatch: (() => void) | null = null;
  let permalinkMessage = $state<MessageType | null>(null);
  let messageLoader = $state<ReturnType<typeof createMessageLoader> | null>(null);
  let hasMore = $state(false);
  let loadingMore = $state(false);
  let showPostForm = $state(false);
  let showAbout = $state(false);
  const rpcUrl = (import.meta.env.VITE_LOCAL_RPC_URL || 'http://localhost:8545').replace(/^https?:\/\//, '');

  async function handleHashChange() {
    if (!browser) return;
    const hash = window.location.hash;
    
    if (hash === ROUTES.ABOUT) {
      showAbout = true;
    } else {
      showAbout = false;
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
  }

  onMount(async () => {
    await autoConnect();
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    try {
      messageLoader = createMessageLoader();
      const { hasMore: more } = await messageLoader.loadInitialStreaming(50, (pageMessages: any[]) => {
        // First page: replace messages, subsequent pages append to end
        if (messages.length === 0) {
          messages = pageMessages;
        } else {
          // Older pages should be appended at the end (since they are older)
          messages = [...messages, ...pageMessages];
        }
      });
      hasMore = more;
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
    if (browser) {
      window.removeEventListener('hashchange', handleHashChange);
    }
  });

  async function handleLoadMore() {
    if (!messageLoader || loadingMore) return;
    loadingMore = true;
    try {
      const { messages: newMessages, hasMore: more } = await messageLoader.loadMore(50);
      messages = [...messages, ...newMessages];
      hasMore = more;
    } catch (err) {
      console.error('Failed to load more messages:', err);
    } finally {
      loadingMore = false;
    }
  }

  async function handlePost() {
    if (!newMessage.trim() || posting) return;
    posting = true;
    try {
      const txHash = await postMessage(newMessage.trim());
      pendingTxHash = txHash;
      newMessage = '';
      showPostForm = false;
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
</script>

<div class="container">
  <header class="header">
    <h1 class="logo"><a href="#" onclick={() => permalinkMessage = null}>PINBO.eth</a></h1>
    <div class="wallet-section">
      <a href={ROUTES.ABOUT} class="about-link">About</a>
      {#if $isConnected}
        <span class="middot">·</span>
        <div class="connected">
          <Address address={$account!} />
          <button class="btn-icon" onclick={disconnect} title="Disconnect">⏻</button>
          <span class="middot">·</span>
          <button class="btn post-btn" onclick={() => showPostForm = !showPostForm}>POST</button>
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
      {:else if showPostForm}
        <div class="post-section">
          <div class="input-group">
            <TuiEditor bind:value={newMessage} placeholder="What's on your mind?" />
            <button class="btn" onclick={handlePost} disabled={posting || !newMessage.trim()}>
              {posting ? 'POSTING...' : 'SEND'}
            </button>
          </div>
        </div>
      {/if}
    {/if}

    {#if showAbout}
      <div class="about-section">
        {@html aboutContent}
      </div>
    {:else if permalinkMessage}
      <Message message={permalinkMessage} showPermalink={false} />
    {:else}
    <div class="messages-section">
      {#if loading}
        <div class="loading">LOADING...</div>
      {:else if messages.length === 0}
        <div class="empty">NO MESSAGES YET. BE THE FIRST TO POST!</div>
      {:else}
        <div class="messages-list">
          {#each messages as message (message.blockNumber)}
            <div transition:fade>
              <Message {message} />
            </div>
          {/each}
        </div>
        {#if hasMore}
          <div class="load-more">
            <button class="btn" onclick={handleLoadMore} disabled={loadingMore}>
              {loadingMore ? 'LOADING...' : 'MORE'}
            </button>
          </div>
        {/if}
      {/if}
    </div>
    {/if}
  </main>
  <footer class="footer">
    RPC: {rpcUrl}
  </footer>
</div>

<style>
  :global(body) {
    font-family: Arial, sans-serif;
    font-size: 1.05rem;
  }
  :global(h1), :global(h2), :global(h3), :global(h4), :global(h5), :global(h6) {
    color: var(--orange);
    font-family: 'Arial Narrow', Arial, sans-serif;
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
    font-size: 1rem;
    font-weight: 800;
    color: var(--primary);
    margin: 0;
    font-family: 'Arial Narrow', sans-serif;
  }
  .logo a {
    color: inherit;
    text-decoration: none;
  }
  .wallet-section {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  .connected {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .about-link {
    color: var(--text-secondary);
    text-decoration: none;
  }
  .about-link:hover {
    color: var(--primary);
  }
  .middot {
    color: var(--text-secondary);
    margin: 0 0.1rem;
  }
  .post-btn {
    background-color: var(--secondary);
    margin-left: 0.5rem;
  }
  .btn-icon {
    background: none;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 1rem;
    padding: 0.25rem;
    margin-left: 0.25rem;
  }
  .btn-icon:hover {
    color: var(--error);
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
    font-family: monospace;
  }
  .btn:hover {
    opacity: 0.9;
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .btn.connect, .btn.post-btn {
    background-color: var(--secondary);
  }
  .post-section {
    margin-bottom: 2rem;
    padding: 1rem 0;
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
  .load-more {
    display: flex;
    justify-content: center;
    margin-top: 2rem;
    margin-bottom: 2rem;
  }
  .footer {
    margin-top: 4rem;
    padding: 1rem 0;
    border-top: 1px solid var(--surface-alt);
    background: var(--background);
    text-align: center;
    font-size: 0.65rem;
    color: var(--text-secondary);
  }
</style>
