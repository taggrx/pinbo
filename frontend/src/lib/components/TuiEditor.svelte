<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  // @ts-ignore - no types available
  import Editor from '@toast-ui/editor';
  import '@toast-ui/editor/dist/toastui-editor.css';
  import '@toast-ui/editor/dist/theme/toastui-editor-dark.css';

  let { value = $bindable(''), placeholder = '' } = $props();

  let container: HTMLDivElement;
  // @ts-ignore - no types available
  let editor: Editor;

  onMount(() => {
    editor = new Editor({
      el: container,
      initialEditType: 'wysiwyg',
      previewStyle: 'tab',
      height: '200px',
      placeholder,
      usageStatistics: false,
      theme: 'dark',
      toolbarItems: [
        ['bold', 'italic', 'strike'],
        ['link', 'image'],
        ['ul', 'ol'],
      ],
    });

    editor.on('change', () => {
      value = editor.getHTML();
    });
  });

  onDestroy(() => {
    if (editor) {
      editor.destroy();
    }
  });
</script>

<div bind:this={container}></div>

<style>
  /* Font */
  :global(.toastui-editor-defaultUI),
  :global(.toastui-editor-defaultUI *),
  :global(.ProseMirror) {
    font-family: Arial, sans-serif !important;
    font-size: 1rem !important;
  }

  /* Container + text */
  :global(.toastui-editor-dark.toastui-editor-defaultUI) {
    border-color: var(--surface-alt);
    color: var(--fg);
  }
  :global(.toastui-editor-dark .toastui-editor-md-container),
  :global(.toastui-editor-dark .toastui-editor-ww-container) {
    background-color: var(--bg0);
  }

  /* Toolbar */
  :global(.toastui-editor-dark .toastui-editor-defaultUI-toolbar) {
    background-color: var(--bg2);
    border-bottom-color: var(--bg3);
  }
  :global(.toastui-editor-dark .toastui-editor-toolbar-icons) {
    border-color: var(--bg2);
  }
  :global(.toastui-editor-dark .toastui-editor-toolbar-icons:not(:disabled):hover) {
    background-color: var(--bg3);
    border-color: var(--bg3);
  }
  :global(.toastui-editor-dark .toastui-editor-toolbar-divider) {
    background-color: var(--bg3);
  }

  /* Markdown write/preview tabs */
  :global(.toastui-editor-dark .toastui-editor-md-tab-container) {
    background-color: var(--bg2);
    border-bottom-color: var(--bg3);
  }
  :global(.toastui-editor-dark .toastui-editor-md-tab-container .tab-item) {
    border-color: var(--bg3);
    background-color: var(--bg1);
    color: var(--text-secondary);
  }
  :global(.toastui-editor-dark .toastui-editor-md-tab-container .tab-item.active) {
    border-bottom-color: var(--bg0);
    background-color: var(--bg0);
    color: var(--fg);
  }

  /* Mode switch */
  :global(.toastui-editor-dark .toastui-editor-mode-switch) {
    border-top-color: var(--bg3);
    background-color: var(--bg0);
  }
  :global(.toastui-editor-dark .toastui-editor-mode-switch .tab-item) {
    border-color: var(--bg3);
    background-color: var(--bg2);
    color: var(--text-secondary);
  }
  :global(.toastui-editor-dark .toastui-editor-mode-switch .tab-item.active) {
    border-top-color: var(--bg0);
    background-color: var(--bg0);
    color: var(--fg);
  }

  /* Close / OK buttons */
  :global(.toastui-editor-dark.toastui-editor-defaultUI .toastui-editor-close-button) {
    color: var(--fg);
    border-color: var(--bg3);
    background-color: var(--bg2);
  }
  :global(.toastui-editor-dark.toastui-editor-defaultUI .toastui-editor-close-button:hover) {
    border-color: var(--surface-alt);
  }
  :global(.toastui-editor-dark.toastui-editor-defaultUI .toastui-editor-ok-button) {
    color: var(--bg0);
    background-color: var(--primary);
  }
  :global(.toastui-editor-dark.toastui-editor-defaultUI .toastui-editor-ok-button:hover) {
    background-color: var(--secondary);
  }
</style>
