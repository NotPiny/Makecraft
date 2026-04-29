<script lang="ts">
    import Arrows from '$lib/components/Arrows.svelte';
    import { Card } from 'm3-svelte';
    import { theme, themeList, setTheme, type Theme } from '$lib/theme.svelte';

    let selectedTheme = $state<Theme>(theme.current);

    $effect(() => {
        setTheme(selectedTheme);
    });
</script>

<div class="content">
    <Card variant="filled">
        <h1>Settings</h1>
        <label>
            <Arrows list={[...themeList]} bind:value={selectedTheme} initialIndex={themeList.indexOf(theme.current)} /> Theme: {selectedTheme[0].toUpperCase() + selectedTheme.slice(1)}
        </label>
    </Card>
</div>

<style>
    .content {
        margin: 1rem;
    }

    label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
</style>