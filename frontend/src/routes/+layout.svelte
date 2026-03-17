<script lang="ts">
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<meta name="description" content="A decentralized public message board on Ethereum." />
	<meta property="og:site_name" content="Pinbo" />
	<meta property="og:type" content="website" />
	<meta property="og:title" content="Pinbo" />
	<meta property="og:description" content="A decentralized public message board on Ethereum." />
</svelte:head>

{@render children()}
