<script lang="ts">
	import { renderMarkdown } from '$lib/utils';

	interface Props {
		text: string;
	}

	let { text }: Props = $props();
</script>

<div class="markdown">{@html renderMarkdown(text)}</div>

<style>
	.markdown {
		line-height: 1.5;
	}
	.markdown :global(pre),
	.markdown :global(code) {
		background: var(--surface-alt);
	}
</style>
