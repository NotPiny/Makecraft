<script lang="ts">
	import { Card, Icon } from "m3-svelte";
	import { filedrop } from "filedrop-svelte";
	import type { Files } from "filedrop-svelte";
	import iconPackage from "@ktibow/iconset-material-symbols/package-2";

	interface Props {
		files?: Files;
		description: string;
		variant?: "filled" | "elevated" | "outlined";
		onchange?: (files: Files) => void;
	}

	let { files = $bindable(), description, variant = "filled", onchange }: Props = $props();

	function filezone(node: HTMLElement) {
		filedrop(node, { windowDrop: false });
		const handler = (e: Event) => {
			const dropped = (e as CustomEvent<{ files: Files }>).detail.files;
			files = dropped;
			onchange?.(dropped);
		};
		node.addEventListener("filedrop", handler);
		return {
			destroy() {
				node.removeEventListener("filedrop", handler);
			},
		};
	}
</script>

<label class="upload-zone" use:filezone>
	<Card {variant}>
		<div class="card-content">
			<Icon icon={iconPackage} size={96} />
			<div>
				<h1>{files ? files.accepted[0].name : "No file selected"}</h1>
				<p>{description}</p>
			</div>
		</div>
	</Card>
</label>

<style>
	.upload-zone {
		cursor: pointer;
	}

	.card-content {
		display: flex;
		gap: 1rem;
		padding: 1rem;
	}
</style>
