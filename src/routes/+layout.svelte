<script lang="ts">
	import '$lib/global.scss';
	import '$lib/m3.css';
	import iconHome from '@ktibow/iconset-material-symbols/home';
	import iconPack from '@ktibow/iconset-material-symbols/package-2-outline';
	import iconCode from '@ktibow/iconset-material-symbols/code';
	import favicon from '$lib/assets/favicon.svg';
    import { Button, Card, Icon, NavigationRail, NavigationRailItem } from 'm3-svelte';
	import { page } from '$app/state';
    import { onMount } from 'svelte';

	let { children } = $props();
	let mobile = $state(false);

	const navigationItems = [
		{
			href: '/',
			label: 'Home',
			icon: iconHome,
		},
		{
			href: '/mrpack',
			label: 'MRPack',
			icon: iconPack
		}
	];

	onMount(() => {
		const checkMobile = () => {
			mobile = window.innerWidth < 768;
		};

		checkMobile();
		window.addEventListener('resize', checkMobile);
		return () => window.removeEventListener('resize', checkMobile);
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if mobile}
	<div class="mobile-warning">
		{#if Math.floor(Math.random() * 500) === 408}
			Begone Peasant!
		{:else}
			I'm sorry, but this website is not optimized for mobile devices. Please visit on a desktop or laptop for the best experience. Desktop Mode might work on some mobile browsers, but it's not guaranteed.
		{/if}
	</div>
{/if}
<div class="app">
	<center>
		<NavigationRail open={true}>
			{#each navigationItems as item}
				<NavigationRailItem href={item.href} label={item.label} icon={item.icon} active={item.href === page.url.pathname} />
			{/each}
		</NavigationRail>
	</center>

	<div class="page">
		{@render children()}

		<footer>
			<Card variant="elevated">
				<p>NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT</p>
				<center>
					<div class="links">
						<Button variant="tonal" href="https://github.com/NotPiny/Makecraft" target="_blank">
							<Icon icon={iconCode} />
						</Button>
					</div>
				</center>
			</Card>
		</footer>
	</div>
</div>

<style>
	.app {
		display: flex;
		min-height: 100vh;
	}

	.page {
		flex: 1;
		display: flex;
		flex-direction: column;
	}

	footer {
		display: flex;
		justify-content: center;
		padding: 1rem;
	}

	.mobile-warning {
		background-color: var(--m3c-error);
		color: var(--m3c-on-error);
		padding: 1rem;
		text-align: center;
		font-weight: bold;
	}
</style>