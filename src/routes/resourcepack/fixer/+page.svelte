<script lang="ts">
    import type { Files } from "filedrop-svelte";
    import FileDropZone from "../../mrpack/FileDropZone.svelte";
    import { Button, Card, LoadingIndicator, Switch } from "m3-svelte";
    import { fixPack } from "$lib/packFixer";

    let files: Files | undefined = $state();

    let isProcessing = $state(false);
    let minimal = $state(true);
    let output: Blob | null = $state(null);
    let logs: string[] = $state([]);
    let logEl: HTMLPreElement | undefined = $state();

    async function acceptFile() {
        const file = files?.accepted[0];
        if (!file) return alert("No file selected");

        const arrayBuffer = await file.arrayBuffer();
        logs = [];
        isProcessing = true;

        if (minimal) {
            output = await fixPack(arrayBuffer, undefined, true);
        } else {
            output = await fixPack(arrayBuffer, (msg) => {
                logs.push(msg);
                logs = logs;
                setTimeout(() => logEl?.scrollTo(0, logEl.scrollHeight), 0);
            }, false);
        }

        isProcessing = false;
    }
</script>

<svelte:head>
    <title>Resource Pack Fixer - Makecraft</title>
</svelte:head>

<div class="tool">
    <FileDropZone bind:files={files} description="Drop your broken resource pack here" />
    <br/>
    <Card variant="outlined">
        <label class="minimal-toggle">
            <Switch bind:checked={minimal} />
            Minimal mode (super fast, might freeze the website during processing.)
        </label>
        <Button disabled={!files || isProcessing} onclick={acceptFile}>
            {#if isProcessing && !minimal}
                <LoadingIndicator aria-label="Loading" container={true} /> Processing...
            {:else if isProcessing && minimal}
                <LoadingIndicator aria-label="Loading" container={true} /> Processing...
            {:else}
                Fix Pack
            {/if}
        </Button>
        {#if minimal}<div class="minimal-gap"></div>{/if}
        {#if !minimal}
            <h2>Logs</h2>
            {#if isProcessing}
                <p>Processing your resource pack. This may take a few moments...</p>
            {/if}
            <pre class="log-box" bind:this={logEl}>{logs.join('\n')}</pre>
        {/if}
        <Button disabled={!output} onclick={() => {
            if (!output) return;
            const url = URL.createObjectURL(output);
            const a = document.createElement('a');
            a.href = url;
            a.download = "fixed_resource_pack.zip";
            a.click();
            URL.revokeObjectURL(url);
        }}>
            Download Fixed Pack
        </Button>
    </Card>
</div>

<style>
    .tool {
        margin: 1rem;
    }

    .minimal-toggle {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        cursor: pointer;
        margin-bottom: 0.5rem;
    }

    .minimal-gap {
        height: 1rem;
    }

    .log-box {
        max-height: 300px;
        overflow-y: auto;
        font-size: 0.75rem;
        white-space: pre-wrap;
        word-break: break-all;
        margin: 0;
    }
</style>