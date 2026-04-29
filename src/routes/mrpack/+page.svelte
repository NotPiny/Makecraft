<script lang="ts">
	import { Button, Card, Icon, LoadingIndicator, Tabs, TextField } from "m3-svelte";
	import { filedrop } from "filedrop-svelte";
	import type { Files } from "filedrop-svelte";
	import iconPackage from "@ktibow/iconset-material-symbols/package-2";
	import { BlobReader, BlobWriter, TextReader, TextWriter, ZipReader, ZipWriter } from "@zip.js/zip.js";
	import type { IndexFile, Project, Version } from "$lib/modrinth.type";
	import ModCard from "./ModCard.svelte";

	let tab = $state("single");
	let compareMode: "side" | "add" | "remove" = $state("side");

	let fileUpload: Files | undefined = $state();
	let fileUploadSecondary: Files | undefined = $state();
	let fileUploadIgnore: Files | undefined = $state();

	let indexFile: IndexFile | undefined = $state();
	let indexFileSecondary: IndexFile | undefined = $state();
	let indexFileIgnore: IndexFile | undefined = $state();

	let fetchedProjects: Record<string, Project> = $state({});
	let fetchedVersions: Record<string, Version> = $state({});

	let zipReaderMap: Record<string, ZipReader<unknown>> = $state({});

	let mergePackName = $state("");
	let mergePackVersion = $state("");

	let mergeProcessing = $state(false);
	let mergeResult: Blob | undefined = $state();

	function filezone(node: HTMLElement, callback: (files: Files) => void) {
		filedrop(node, { windowDrop: false });
		const handler = (e: Event) => {
			callback((e as CustomEvent<{ files: Files }>).detail.files);
		};
		node.addEventListener("filedrop", handler);
		return {
			destroy() {
				node.removeEventListener("filedrop", handler);
			},
		};
	}

	function handleIndexFile(currentIndexFile: IndexFile) {
		currentIndexFile?.files.forEach((file) => {
			const match = file.downloads[0].match(
				/https:\/\/cdn\.modrinth\.com\/data\/([A-Za-z0-9]+)\/versions\/([A-Za-z0-9]+)/i,
			);
			const projectId = match?.[1];
			if (!projectId)
				return console.error(
					"Could not extract project ID from download URL:",
					file.downloads[0],
				);
			if (projectId in fetchedProjects) return;

			fetch(`https://api.modrinth.com/v2/project/${projectId}`)
				.then((response) => response.json())
				.then((projectData: Project) => {
					fetchedProjects[projectId] = projectData;
				})
				.catch((error) => {
					console.error(
						`Error fetching project data for ${projectId}:`,
						error,
					);
				});

			fetch(`https://api.modrinth.com/v2/project/${projectId}/version`)
				.then((response) => response.json())
				.then((versionData: Version[]) => {
					if (!Array.isArray(versionData)) return;
					versionData.forEach((version) => {
						fetchedVersions[version.id] = version;
					});
				})
				.catch((error) => {
					console.error(
						`Error fetching version data for ${projectId}:`,
						error,
					);
				});
		});
	}

	async function handleUpload(
		files: Files,
		target: "primary" | "secondary" | "ignore" = "primary",
	) {
		const file = files.accepted[0];
		if (!file) return console.error("No file selected");

		const arrayBuffer = await file.arrayBuffer();

		const zipReader = new ZipReader(
			new BlobReader(new Blob([arrayBuffer])),
		);

		zipReaderMap[target] = zipReader;

		const entries = await zipReader.getEntries();

		const indexFileContent = entries.find(
			(entry) => entry.filename === "modrinth.index.json",
		);
		if (!indexFileContent || indexFileContent.directory) {
			console.error("modrinth.index.json not found in the MRPack");
			alert(
				'This doesn\'t seem to be a valid MRPack file. Please make sure it contains a "modrinth.index.json" file.',
			);
			return;
		}

		const indexContent = await indexFileContent.getData(new TextWriter());
		if (target === "secondary") {
			indexFileSecondary = JSON.parse(indexContent);
			console.log(
				"modrinth.index.json content (secondary):",
				indexFileSecondary,
			);
			handleIndexFile(indexFileSecondary!);
		} else if (target === "ignore") {
			indexFileIgnore = JSON.parse(indexContent);
			console.log(
				"modrinth.index.json content (ignore):",
				indexFileIgnore,
			);
			handleIndexFile(indexFileIgnore!);
		} else {
			indexFile = JSON.parse(indexContent);
			console.log("modrinth.index.json content:", indexFile);
			handleIndexFile(indexFile!);
		}
	}

	function isIgnored(downloadUrl: string): boolean {
		if (!indexFileIgnore) return false;
		return indexFileIgnore.files.some(
			(f) => f.downloads[0] === downloadUrl,
		);
	}

	async function mergePacks() {
		if (!indexFile || !indexFileSecondary) {
			alert("Please upload both MRPack files before merging.");
			return;
		}

		mergeProcessing = true;

		try {
			const primaryReader = zipReaderMap['primary'];
			const secondaryReader = zipReaderMap['secondary'];

			const mergedIndex: IndexFile = indexFile;

			indexFileSecondary.files.forEach((file) => {
				if (!mergedIndex.files.some((f) => f.downloads[0] === file.downloads[0])) {
					mergedIndex.files.push(file);
				} else {
					const existingFile = mergedIndex.files.find(
						(f) => f.downloads[0] === file.downloads[0],
					);
					if (existingFile) {
						Object.assign(existingFile, file);
					}
				}
			});

			const zipWriter = new ZipWriter(new BlobWriter("application/zip"));
			await zipWriter.add("modrinth.index.json", new TextReader(JSON.stringify(mergedIndex, null, 4)));

			const addedPaths = new Set<string>();

			const primaryEntries = await primaryReader.getEntries();
			for (const entry of primaryEntries) {
				if (entry.filename === "modrinth.index.json") continue;
				if (entry.directory) continue;
				const blob = await entry.getData(new BlobWriter());
				await zipWriter.add(entry.filename, new BlobReader(blob));
				addedPaths.add(entry.filename);
			}

			const secondaryEntries = await secondaryReader.getEntries();
			for (const entry of secondaryEntries) {
				if (entry.filename === "modrinth.index.json") continue;
				if (entry.directory) continue;
				if (addedPaths.has(entry.filename)) continue;
				const blob = await entry.getData(new BlobWriter());
				await zipWriter.add(entry.filename, new BlobReader(blob));
			}

			mergeResult = await zipWriter.close();
		} catch (error) {
			console.error("Error creating merged pack:", error);
			alert("An error occurred while merging the packs. Please try again.");
		} finally {
			mergeProcessing = false;
		}
	}
</script>

<svelte:head>
	<title>MRPack - Makecraft</title>
</svelte:head>

<Tabs
	items={[
		{ name: "Single", value: "single" },
		{ name: "Compare", value: "compare" },
		{ name: "Merge", value: "merge" },
	]}
	bind:tab
/>

<div class="tool">
	{#if tab === "single"}
		<label
			class="upload-zone"
			use:filezone={(files) => {
				fileUpload = files;
				handleUpload(files);
			}}
		>
			<Card variant="filled">
				<div class="card-content">
					<Icon icon={iconPackage} size={96} />
					<div>
						<h1>
							{#if fileUpload}{fileUpload.accepted[0]
									.name}{:else}No file selected{/if}
						</h1>
						<p>
							Your MRPack file here, just drop the file here or
							click to select it.
						</p>
					</div>
				</div>
			</Card>
		</label>
	{:else}
		<Card variant="filled">
			<div class="card-content">
				<label
					class="upload-zone"
					use:filezone={(files) => {
						fileUpload = files;
						handleUpload(files);
					}}
				>
					<Card variant="elevated">
						<Icon icon={iconPackage} size={96} />
						<div>
							<h1>
								{#if fileUpload}{fileUpload.accepted[0]
										.name}{:else}No file selected{/if}
							</h1>
							<p>
								Your first MRPack file here, just drop the file
								here or click to select it.
							</p>
						</div>
					</Card>
				</label>
				<label
					class="upload-zone"
					use:filezone={(files) => {
						fileUploadSecondary = files;
						handleUpload(files, "secondary");
					}}
				>
					<Card variant="elevated">
						<Icon icon={iconPackage} size={96} />
						<div>
							<h1>
								{#if fileUploadSecondary}{fileUploadSecondary
										.accepted[0].name}{:else}No file
									selected{/if}
							</h1>
							<p>
								Your second MRPack file here, just drop the file
								here or click to select it.
							</p>
						</div>
					</Card>
				</label>
				{#if tab === "compare"}
					<label
						class="upload-zone"
						use:filezone={(files) => {
							fileUploadIgnore = files;
							handleUpload(files, "ignore");
						}}
					>
						<Card variant="elevated">
							<Icon icon={iconPackage} size={96} />
							<div>
								<h1>
									{#if fileUploadIgnore}{fileUploadIgnore
											.accepted[0].name}{:else}No file
										selected{/if}
								</h1>
								<p>
									Ignore pack (optional) — mods in this pack
									will be excluded from the output.
								</p>
							</div>
						</Card>
					</label>
				{/if}
			</div>
		</Card>
	{/if}

	{#if tab === "single"}
		{#if indexFile}
			<div class="mod-list">
				{#each indexFile.files as file}
					{@const projectId = file.downloads[0].match(
						/https:\/\/cdn\.modrinth\.com\/data\/([A-Za-z0-9]+)\/versions\/([A-Za-z0-9]+)/i,
					)?.[1]}
					{#if projectId && fetchedProjects[projectId]}
						<ModCard
							project={fetchedProjects[projectId]}
							{fetchedProjects}
							{fetchedVersions}
						/>
					{:else}
						<p>Loading project data...</p>
					{/if}
				{/each}
			</div>
		{/if}
	{/if}

	{#if tab === "compare"}
		{#if indexFile && indexFileSecondary}
			<Tabs
				items={[
					{ name: "Side by Side", value: "side" },
					{ name: "Additions", value: "add" },
					{ name: "Removals", value: "remove" },
				]}
				bind:tab={compareMode}
				secondary={true}
			/>
			{#if compareMode === "side"}
				<br />
				<div class="side-by-side">
					<div class="side-by-side_left">
						<div class="mod-list">
							{#each indexFile.files as file}
								{@const projectId = file.downloads[0].match(
									/https:\/\/cdn\.modrinth\.com\/data\/([A-Za-z0-9]+)\/versions\/([A-Za-z0-9]+)/i,
								)?.[1]}
								{#if !isIgnored(file.downloads[0])}
									{#if projectId && fetchedProjects[projectId]}
										<ModCard
											project={fetchedProjects[projectId]}
											{fetchedProjects}
											{fetchedVersions}
										/>
									{:else}
										<p>Loading project data...</p>
									{/if}
								{/if}
							{/each}
						</div>
					</div>
					<div class="side-by-side_right">
						<div class="mod-list">
							{#each indexFileSecondary.files as file}
								{@const projectId = file.downloads[0].match(
									/https:\/\/cdn\.modrinth\.com\/data\/([A-Za-z0-9]+)\/versions\/([A-Za-z0-9]+)/i,
								)?.[1]}
								{#if !isIgnored(file.downloads[0])}
									{#if projectId && fetchedProjects[projectId]}
										<ModCard
											project={fetchedProjects[projectId]}
											{fetchedProjects}
											{fetchedVersions}
										/>
									{:else}
										<p>Loading project data...</p>
									{/if}
								{/if}
							{/each}
						</div>
					</div>
				</div>
			{/if}

			{#if compareMode === "add"}
				<div class="mod-list">
					{#each indexFileSecondary.files as file}
						{@const projectId = file.downloads[0].match(
							/https:\/\/cdn\.modrinth\.com\/data\/([A-Za-z0-9]+)\/versions\/([A-Za-z0-9]+)/i,
						)?.[1]}
						{#if !isIgnored(file.downloads[0]) && !indexFile.files.some((f) => f.downloads[0] === file.downloads[0])}
							{#if projectId && fetchedProjects[projectId]}
								<ModCard
									project={fetchedProjects[projectId]}
									{fetchedProjects}
									{fetchedVersions}
								/>
							{:else}
								<p>Loading project data...</p>
							{/if}
						{/if}
					{/each}
				</div>
			{/if}

			{#if compareMode === "remove"}
				<div class="mod-list">
					{#each indexFile.files as file}
						{@const projectId = file.downloads[0].match(
							/https:\/\/cdn\.modrinth\.com\/data\/([A-Za-z0-9]+)\/versions\/([A-Za-z0-9]+)/i,
						)?.[1]}
						{#if !isIgnored(file.downloads[0]) && !indexFileSecondary.files.some((f) => f.downloads[0] === file.downloads[0])}
							{#if projectId && fetchedProjects[projectId]}
								<ModCard
									project={fetchedProjects[projectId]}
									{fetchedProjects}
									{fetchedVersions}
								/>
							{:else}
								<p>Loading project data...</p>
							{/if}
						{/if}
					{/each}
				</div>
			{/if}
		{:else}
			<p>Please upload both MRPack files to compare.</p>
		{/if}
	{/if}

	{#if tab === "merge"}
		<br/>
		<Card variant="outlined">
			<h1>Pack Merge</h1>
			<p>
				Take two MRPack files to merge them into a single pack. The
				resulting pack will contain all unique aspects from both packs.
				If a mod (or override) exists in both packs, the version from the second
				pack will be used.
			</p>

			<div class="split-input">
				<TextField label="Name*" bind:value={mergePackName} />
				<TextField label="Version*" bind:value={mergePackVersion} />
			</div>

			<Button
				onclick={mergePacks}
				disabled={!indexFile || !indexFileSecondary || !mergePackName || !mergePackVersion}
			>
				Merge!
			</Button>
			{#if mergeProcessing}
				<LoadingIndicator aria-label="Loading" />
			{:else if mergeResult}
				<p>The merged pack is ready for download.</p>
				<a href={URL.createObjectURL(mergeResult)} download={`${mergePackName}-${mergePackVersion}.mrpack`}>
					<Button>Download Merged Pack</Button>
				</a>
			{/if}
		</Card>
	{/if}
</div>

<style>
	.tool {
		margin: 1rem;
	}

	.card-content {
		display: flex;
		gap: 1rem;
		padding: 1rem;
	}

	.upload-zone {
		cursor: pointer;
	}

	.mod-list {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: 1rem;
		margin-top: 1rem;
	}

	.side-by-side {
		display: flex;
		gap: 1rem;
	}

	.side-by-side .mod-list {
		padding: 1rem;
		padding-top: 0;
	}

	.side-by-side_left,
	.side-by-side_right {
		border-radius: var(--m3-card-shape);
		background-color: var(--m3c-surface-container);
	}

	.split-input {
		display: flex;
		gap: 1rem;
		margin: 1rem 0;
	}
</style>
