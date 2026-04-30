<script lang="ts">
	import { Button, Card, ConnectedButtons, Icon, LoadingIndicator, Switch, Tabs, TextField } from "m3-svelte";
	import { filedrop } from "filedrop-svelte";
	import type { Files } from "filedrop-svelte";
	import iconPackage from "@ktibow/iconset-material-symbols/package-2";
	import { BlobReader, BlobWriter, TextReader, TextWriter, ZipReader, ZipWriter } from "@zip.js/zip.js";
	import type { IndexFile, Project, Version } from "$lib/modrinth.type";
	import ModCard from "./ModCard.svelte";
    import type { ModpackManifestFile } from "$lib/curseforge.type";

	type OverrideFile = {
		path: string;
		type: 'text' | 'image' | 'unknown';
		content?: string;
		blobUrl?: string;
	};

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
	let primaryZipEntries: string[] = $state([]);
	let primaryOverrides: OverrideFile[] = $state([]);
	let secondaryOverrides: OverrideFile[] = $state([]);

	let mergePackName = $state("");
	let mergePackVersion = $state("");

	let mergeProcessing = $state(false);
	let mergeResult: Blob | undefined = $state();

	let isModrinthToCurseforge = $state(true);

	let conversionProcessing = $state(false);
	let M2CConvertOutput: Blob | undefined = $state();
	let m2cProgress = $state({ current: 0, total: 0, name: '' });

	let cfFileUpload: Files | undefined = $state();
	let cfManifest: ModpackManifestFile | undefined = $state();
	let c2mProcessing = $state(false);
	let C2MConvertOutput: Blob | undefined = $state();
	let c2mProgress = $state({ current: 0, total: 0, name: '' });

	function detectOverrideType(filename: string): 'text' | 'image' | 'unknown' {
		const ext = filename.split('.').pop()?.toLowerCase() ?? '';
		const TEXT_EXTS = new Set(['txt', 'json', 'toml', 'yaml', 'yml', 'cfg', 'properties', 'md', 'xml', 'conf', 'ini', 'snbt', 'mcmeta', 'mcfunction', 'zs', 'js', 'ts']);
		const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']);
		if (TEXT_EXTS.has(ext)) return 'text';
		if (IMAGE_EXTS.has(ext)) return 'image';
		return 'unknown';
	}

	async function buildOverrideFiles(
		entries: Awaited<ReturnType<ZipReader<unknown>['getEntries']>>,
	): Promise<OverrideFile[]> {
		const filtered = entries.filter((e) => !e.directory && e.filename !== 'modrinth.index.json');
		return Promise.all(
			filtered.map(async (entry) => {
				const type = detectOverrideType(entry.filename);
				if (entry.directory) return { path: entry.filename, type: 'unknown' as const };
				if (type === 'text') {
					const content = await entry.getData(new TextWriter());
					return { path: entry.filename, type, content };
				} else if (type === 'image') {
					const blob = await entry.getData(new BlobWriter());
					return { path: entry.filename, type, blobUrl: URL.createObjectURL(blob) };
				} else {
					// Try MIME type detection via blob
					const blob = await entry.getData(new BlobWriter());
					if (blob.type && blob.type !== '' && blob.type !== 'application/octet-stream') {
						if (blob.type.startsWith('image/')) {
							return { path: entry.filename, type: 'image' as const, blobUrl: URL.createObjectURL(blob) };
						}
						if (blob.type.startsWith('text/')) {
							return { path: entry.filename, type: 'text' as const, content: await blob.text() };
						}
					}
					return { path: entry.filename, type: 'unknown' as const };
				}
			}),
		);
	}

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
			secondaryOverrides = await buildOverrideFiles(entries);
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
			primaryOverrides = await buildOverrideFiles(entries);
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

	async function convertModrinthToCurseforge() {
		if (!indexFile) {
			alert("Please upload an MRPack file to convert.");
			return;
		}

		conversionProcessing = true;
		m2cProgress = { current: 0, total: indexFile.files.length, name: '' };

		try {
			const modZipReader = zipReaderMap['primary'];
			const curseZipWriter = new ZipWriter(new BlobWriter("application/zip"));

			const curseManifest: ModpackManifestFile = {
				minecraft: {
					version: indexFile.dependencies.minecraft,
					modLoaders: [
						{
							id: indexFile.dependencies["fabric-loader"] ? 
								`fabric-${indexFile.dependencies["fabric-loader"]}` :
								indexFile.dependencies["forge"] ?
									`forge-${indexFile.dependencies["forge"]}` :
									indexFile.dependencies["quilt-loader"] ?
										`quilt-${indexFile.dependencies["quilt-loader"]}` :
									indexFile.dependencies["neoforge"] ?
										`neoforge-${indexFile.dependencies["neoforge"]}` :
										'magic-loader-something-went-wrong-uh-oh',
							primary: true
						}
					]
				},
				manifestType: 'minecraftModpack',
				manifestVersion: 1,
				name: indexFile.name,
				version: indexFile.versionId,
				author: 'Makecraft pack converter',
				overrides: 'overrides',
				files: [],
				image: 'https://picsum.photos/512/512.jpg' // TODO: Actually include an image
			};

			// Copy existing overrides from the mrpack
			const entries = await modZipReader.getEntries();
			for (const entry of entries) {
				if (entry.filename === "modrinth.index.json") continue;
				if (entry.directory) continue;
				const blob = await entry.getData(new BlobWriter());
				await curseZipWriter.add(entry.filename, new BlobReader(blob));
			}

			// Download each mod file, compute CurseForge Murmur2 fingerprint
			type DownloadedFile = {
				mrFile: typeof indexFile.files[number];
				filename: string;
				fingerprint: number;
				buffer: ArrayBuffer;
			};

			function cfMurmur2(data: Uint8Array): number {
				const filtered = data.filter(b => b !== 9 && b !== 10 && b !== 13 && b !== 32);
				const m = 0x5bd1e995;
				let h = (1 ^ filtered.length) >>> 0;
				let i = 0;
				while (i + 4 <= filtered.length) {
					let k = (filtered[i] | (filtered[i+1] << 8) | (filtered[i+2] << 16) | (filtered[i+3] << 24)) >>> 0;
					k = Math.imul(k, m) >>> 0;
					k ^= k >>> 24;
					k = Math.imul(k, m) >>> 0;
					h = Math.imul(h, m) >>> 0;
					h = (h ^ k) >>> 0;
					i += 4;
				}
				const rem = filtered.length - i;
				if (rem >= 3) h = (h ^ (filtered[i + 2] << 16)) >>> 0;
				if (rem >= 2) h = (h ^ (filtered[i + 1] << 8)) >>> 0;
				if (rem >= 1) {
					h = (h ^ filtered[i]) >>> 0;
					h = Math.imul(h, m) >>> 0;
				}
				h ^= h >>> 13;
				h = Math.imul(h, m) >>> 0;
				h ^= h >>> 15;
				return h >>> 0;
			}

			const downloadedFiles: DownloadedFile[] = [];
			for (const mrFile of indexFile.files) {
				const filename = mrFile.path.split('/').pop() ?? mrFile.path;
				m2cProgress = { current: m2cProgress.current, total: m2cProgress.total, name: filename };
				const response = await fetch(mrFile.downloads[0]);
				const buffer = await response.arrayBuffer();
				const fingerprint = cfMurmur2(new Uint8Array(buffer));
				downloadedFiles.push({ mrFile, filename, fingerprint, buffer });
				m2cProgress = { current: m2cProgress.current + 1, total: m2cProgress.total, name: filename };
			}

			// Batch fingerprint lookup on CurseForge
			type CFMatch = { id: number; file: { id: number; modId: number } };
			let exactMatches: CFMatch[] = [];
			if (downloadedFiles.length > 0) {
				const fpRes = await fetch(
					`/api/proxy?url=${encodeURIComponent('https://api.curse.tools/v1/fingerprints')}`,
					{
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ fingerprints: downloadedFiles.map(f => f.fingerprint) }),
					}
				);
				const fpJson = await fpRes.json();
				exactMatches = fpJson?.data?.exactMatches ?? [];
			}

			const matchedByFingerprint = new Map<number, CFMatch>();
			for (const match of exactMatches) {
				matchedByFingerprint.set(match.id, match);
			}

			for (const df of downloadedFiles) {
				const match = matchedByFingerprint.get(df.fingerprint);
				if (match) {
					curseManifest.files.push({
						projectID: match.file.modId,
						fileID: match.file.id,
						required: true,
						isLocked: false,
					});
				} else {
					// Not on CurseForge — bundle as override
					await curseZipWriter.add(
						`overrides/${df.mrFile.path}`,
						new BlobReader(new Blob([df.buffer])),
					);
				}
			}

			await curseZipWriter.add("manifest.json", new TextReader(JSON.stringify(curseManifest, null, 4)));

			M2CConvertOutput = await curseZipWriter.close();
		} catch (error) {
			console.error("Error converting pack:", error);
			alert("An error occurred while converting the pack. Please try again.");
		} finally {
			conversionProcessing = false;
		}
	}

	async function handleCFUpload(files: Files) {
		const file = files.accepted[0];
		if (!file) return console.error("No file selected");

		const arrayBuffer = await file.arrayBuffer();
		const zipReader = new ZipReader(new BlobReader(new Blob([arrayBuffer])));
		zipReaderMap["cf"] = zipReader;

		const entries = await zipReader.getEntries();
		const manifestEntry = entries.find((e) => e.filename === "manifest.json");
		if (!manifestEntry || manifestEntry.directory) {
			alert(
				'This doesn\'t seem to be a valid CurseForge modpack. Please make sure it contains a "manifest.json" file.',
			);
			return;
		}

		const content = await manifestEntry.getData(new TextWriter());
		cfManifest = JSON.parse(content);
		console.log("manifest.json content:", cfManifest);
	}

	async function convertCurseforgeToModrinth() {
		if (!cfManifest) {
			alert("Please upload a CurseForge modpack first.");
			return;
		}

		c2mProcessing = true;
		c2mProgress = { current: 0, total: cfManifest.files.length, name: '' };

		try {
			const cfReader = zipReaderMap["cf"];
			const overridesFolder = cfManifest.overrides || "overrides";

			// Determine loader from manifest
			const loaderEntry =
				cfManifest.minecraft.modLoaders.find((l) => l.primary) ??
				cfManifest.minecraft.modLoaders[0];
			const loaderId = loaderEntry?.id ?? "";

			const dependencies: IndexFile["dependencies"] = {
				minecraft: cfManifest.minecraft.version,
			};
			if (loaderId.startsWith("fabric-"))
				dependencies["fabric-loader"] = loaderId.replace("fabric-", "");
			else if (loaderId.startsWith("forge-"))
				dependencies["forge"] = loaderId.replace("forge-", "");
			else if (loaderId.startsWith("neoforge-"))
				dependencies["neoforge"] = loaderId.replace("neoforge-", "");
			else if (loaderId.startsWith("quilt-"))
				dependencies["quilt-loader"] = loaderId.replace("quilt-", "");

			type FileData = {
				url: string;
				filename: string;
				sha1: string;
				sha512: string;
				size: number;
				buffer: ArrayBuffer;
			};

			const toHex = (buf: ArrayBuffer) =>
				Array.from(new Uint8Array(buf))
					.map((b) => b.toString(16).padStart(2, "0"))
					.join("");

			// Fetch, download and hash each mod file
			const fileDataList: FileData[] = [];
			for (const cfFile of cfManifest.files) {
				c2mProgress = { ...c2mProgress, name: `Fetching ${cfFile.fileID}...` };
				const res = await fetch(
					`/api/proxy?url=${encodeURIComponent(`https://api.curse.tools/v1/cf/mods/${cfFile.projectID}/files/${cfFile.fileID}`)}`,
				);
				const json = await res.json();
				const info = json.data;
				const downloadUrl: string | null = info?.downloadUrl ?? null;
				const filename: string = info?.fileName ?? `${cfFile.fileID}.jar`;

				if (!downloadUrl) {
					console.warn(
						`No download URL for file ${cfFile.fileID} (${filename}), skipping`,
					);
					continue;
				}

				c2mProgress = { current: c2mProgress.current, total: c2mProgress.total, name: filename };
				const fileRes = await fetch(`/api/proxy?url=${encodeURIComponent(downloadUrl)}`);
				const buffer = await fileRes.arrayBuffer();
				const sha1 = toHex(await crypto.subtle.digest("SHA-1", buffer));
				const sha512 = toHex(await crypto.subtle.digest("SHA-512", buffer));

				fileDataList.push({ url: downloadUrl, filename, sha1, sha512, size: buffer.byteLength, buffer });
				c2mProgress = { current: c2mProgress.current + 1, total: c2mProgress.total, name: filename };
			}

			// Batch lookup on Modrinth by SHA-1
			let modrinthVersions: Record<
				string,
				{ files: Array<{ url: string; hashes: { sha1: string; sha512: string } }> }
			> = {};
			if (fileDataList.length > 0) {
				const lookupRes = await fetch("https://api.modrinth.com/v2/version_files", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						hashes: fileDataList.map((f) => f.sha1),
						algorithm: "sha1",
					}),
				});
				modrinthVersions = await lookupRes.json();
			}

			const mrpackIndex: IndexFile = {
				formatVersion: 1,
				game: "minecraft",
				versionId: cfManifest.version,
				name: cfManifest.name,
				files: [],
				dependencies,
			};

			const zipWriter = new ZipWriter(new BlobWriter("application/zip"));

			for (const fd of fileDataList) {
				const modrinthVersion = modrinthVersions[fd.sha1];
				if (modrinthVersion) {
					const matchedFile = modrinthVersion.files.find(
						(f) => f.hashes.sha1 === fd.sha1,
					);
					if (matchedFile) {
						mrpackIndex.files.push({
							path: `mods/${fd.filename}`,
							hashes: { sha1: fd.sha1, sha512: fd.sha512 },
							env: { client: "required", server: "required" },
							downloads: [matchedFile.url],
							fileSize: fd.size,
						});
						continue;
					}
				}
				// Not on Modrinth — include as override using cached buffer
				await zipWriter.add(
					`overrides/mods/${fd.filename}`,
					new BlobReader(new Blob([fd.buffer])),
				);
			}

			// Copy existing overrides from the CF zip
			const cfEntries = await cfReader.getEntries();
			for (const entry of cfEntries) {
				if (entry.filename === "manifest.json") continue;
				if (entry.directory) continue;
				let targetPath = entry.filename;
				if (targetPath.startsWith(overridesFolder + "/")) {
					targetPath = "overrides/" + targetPath.slice(overridesFolder.length + 1);
				}
				const blob = await entry.getData(new BlobWriter());
				await zipWriter.add(targetPath, new BlobReader(blob));
			}

			await zipWriter.add(
				"modrinth.index.json",
				new TextReader(JSON.stringify(mrpackIndex, null, 4)),
			);

			C2MConvertOutput = await zipWriter.close();
		} catch (error) {
			console.error("Error converting pack:", error);
			alert("An error occurred while converting the pack. Please try again.");
		} finally {
			c2mProcessing = false;
		}
	}
</script>

<svelte:head>
	<title>MRPack - Makecraft</title>
</svelte:head>

{#snippet overrideCard(override: OverrideFile)}
	<Card variant="outlined">
		<div class="override-card">
			<h4>{override.path}</h4>
			{#if override.type === 'text' && override.content !== undefined}
				<pre class="override-text">{override.content}</pre>
			{:else if override.type === 'image' && override.blobUrl}
				<img src={override.blobUrl} alt={override.path} class="override-image" />
			{/if}
		</div>
	</Card>
{/snippet}

<Tabs
	items={[
		{ name: "Single", value: "single" },
		{ name: "Compare", value: "compare" },
		{ name: "Merge", value: "merge" },
		{ name: "Convert", value: "convert" }
	]}
	bind:tab
/>

<div class="tool">
	{#if tab === "single" || (tab === "convert" && isModrinthToCurseforge)}
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
	{:else if tab === "convert" && !isModrinthToCurseforge}
		<label
			class="upload-zone"
			use:filezone={(files) => {
				cfFileUpload = files;
				handleCFUpload(files);
			}}
		>
			<Card variant="filled">
				<div class="card-content">
					<Icon icon={iconPackage} size={96} />
					<div>
						<h1>
							{#if cfFileUpload}{cfFileUpload.accepted[0]
									.name}{:else}No file selected{/if}
						</h1>
						<p>
							Your CurseForge modpack here, just drop the file here or
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
			{#if primaryOverrides.length > 0}
				<h2 class="section-header">Overrides</h2>
				<div class="override-list">
					{#each primaryOverrides as override}
						{@render overrideCard(override)}
					{/each}
				</div>
			{/if}
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
						{#if primaryOverrides.length > 0}
							<h2 class="section-header">Overrides</h2>
							<div class="override-list">
								{#each primaryOverrides as override}
									{@render overrideCard(override)}
								{/each}
							</div>
						{/if}
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
						{#if secondaryOverrides.length > 0}
							<h2 class="section-header">Overrides</h2>
							<div class="override-list">
								{#each secondaryOverrides as override}
									{@render overrideCard(override)}
								{/each}
							</div>
						{/if}
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
				{@const addedOverrides = secondaryOverrides.filter((o) => !primaryOverrides.some((p) => p.path === o.path))}
				{#if addedOverrides.length > 0}
					<h2 class="section-header">Added Overrides</h2>
					<div class="override-list">
						{#each addedOverrides as override}
							{@render overrideCard(override)}
						{/each}
					</div>
				{/if}
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
				{@const removedOverrides = primaryOverrides.filter((o) => !secondaryOverrides.some((s) => s.path === o.path))}
				{#if removedOverrides.length > 0}
					<h2 class="section-header">Removed Overrides</h2>
					<div class="override-list">
						{#each removedOverrides as override}
							{@render overrideCard(override)}
						{/each}
					</div>
				{/if}
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

	{#if tab === "convert"}
		<br/>
		<Card variant="outlined">
			<h1>Conversion</h1>
			<h2>Settings</h2>
			<label style="display: flex; align-items: center; gap: 0.5rem;">
				<Switch bind:checked={isModrinthToCurseforge} icons="none" />
				<p>{isModrinthToCurseforge ? 'Modrinth → CurseForge' : 'CurseForge → Modrinth'}</p>
			</label>
			{#if isModrinthToCurseforge}
				<Button
					onclick={convertModrinthToCurseforge}
					disabled={!indexFile || conversionProcessing}
				>
					{#if conversionProcessing}
						<LoadingIndicator aria-label="Loading" />
					{:else}
						Convert!
					{/if}
				</Button>
				{#if conversionProcessing}
					<div class="progress-row">
						<span>{m2cProgress.current}/{m2cProgress.total}</span>
						<span>{m2cProgress.name || '...'}</span>
						<span>{m2cProgress.total > 0 ? Math.round((m2cProgress.current / m2cProgress.total) * 100) : 0}%</span>
					</div>
				{:else if M2CConvertOutput}
					<p>The converted pack is ready for download.</p>
					<a href={URL.createObjectURL(M2CConvertOutput)} download={`${indexFile?.name ?? 'converted'}-${indexFile?.versionId ?? '1.0'}.zip`}>
						<Button>Download Converted Pack</Button>
					</a>
				{/if}
			{:else}
				<Button
					onclick={convertCurseforgeToModrinth}
					disabled={!cfManifest || c2mProcessing}
				>
					{#if c2mProcessing}
						<LoadingIndicator aria-label="Loading" />
					{:else}
						Convert!
					{/if}
				</Button>
				{#if c2mProcessing}
					<div class="progress-row">
						<span>{c2mProgress.current}/{c2mProgress.total}</span>
						<span>{c2mProgress.name || '...'}</span>
						<span>{c2mProgress.total > 0 ? Math.round((c2mProgress.current / c2mProgress.total) * 100) : 0}%</span>
					</div>
				{:else if C2MConvertOutput}
					<p>The converted pack is ready for download.</p>
					<a href={URL.createObjectURL(C2MConvertOutput)} download={`${cfManifest?.name ?? 'converted'}-${cfManifest?.version ?? '1.0'}.mrpack`}>
						<Button>Download Converted Pack</Button>
					</a>
				{/if}
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

	.progress-row {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.section-header {
		margin-top: 1.5rem;
		margin-bottom: 0.5rem;
	}

	.side-by-side .section-header {
		padding: 0 1rem;
	}

	.override-list {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 1rem;
		margin-top: 0.5rem;
	}

	.side-by-side .override-list {
		padding: 0 1rem 1rem;
	}

	.override-card {
		padding: 0.75rem 1rem;
	}

	.override-card h4 {
		margin: 0 0 0.5rem;
		word-break: break-all;
		font-family: monospace;
		font-size: 0.875rem;
	}

	.override-text {
		margin: 0;
		max-height: 200px;
		overflow: auto;
		font-size: 0.75rem;
		white-space: pre-wrap;
		word-break: break-all;
		background-color: var(--m3c-surface-container-highest);
		border-radius: 4px;
		padding: 0.5rem;
	}

	.override-image {
		max-width: 100%;
		border-radius: 4px;
	}
</style>
