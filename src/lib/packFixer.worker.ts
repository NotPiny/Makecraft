// Now this is where all the heavy lifting happens.
import { zipSync, inflateSync } from 'fflate';

/* eslint-disable no-restricted-globals */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = self as any;

// --- CRC32 ---
const crcTable = (() => {
	const t = new Uint32Array(256);
	for (let i = 0; i < 256; i++) {
		let c = i;
		for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[i] = c >>> 0;
	}
	return t;
})();

function crc32(data: Uint8Array): number {
	let c = 0xffffffff;
	for (let i = 0; i < data.length; i++)
		c = (crcTable[(c ^ data[i]) & 0xff]! ^ (c >>> 8)) >>> 0;
	return (c ^ 0xffffffff) >>> 0;
}

function fixPngCrc(data: Uint8Array): Uint8Array {
	const sig = [137, 80, 78, 71, 13, 10, 26, 10];
	for (let i = 0; i < 8; i++) if (data[i] !== sig[i]) throw new Error('Not a PNG');
	const out = new Uint8Array(data);
	const dv = new DataView(out.buffer, out.byteOffset);
	let pos = 8;
	while (pos + 12 <= out.length) {
		const len = dv.getUint32(pos, false);
		if (pos + 12 + len > out.length) break;
		dv.setUint32(pos + 8 + len, crc32(data.subarray(pos + 4, pos + 8 + len)), false);
		const type = String.fromCharCode(data[pos + 4], data[pos + 5], data[pos + 6], data[pos + 7]);
		pos += 12 + len;
		if (type === 'IEND') break;
	}
	return out;
}

function r16(b: Uint8Array, o: number) { return b[o] | (b[o + 1] << 8); }
function r32(b: Uint8Array, o: number) {
	return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}

type FixEntry = { name: string; data: Uint8Array };

function postLog(msg: string, minimal: boolean) {
	console.log('[packFixer]', msg);
	if (!minimal) ctx.postMessage({ type: 'log', msg });
}

function decompressEntry(
	b: Uint8Array, dataStart: number, compSize: number,
	method: number, name: string, minimal: boolean
): FixEntry | null {
	const compressed = b.subarray(dataStart, dataStart + compSize);
	const t0 = performance.now();
	try {
		let data: Uint8Array;
		if (method === 0) {
			data = new Uint8Array(compressed);
		} else if (method === 8) {
			data = inflateSync(compressed);
		} else {
			postLog(`Unsupported method ${method} for "${name}", skipping`, minimal);
			return null;
		}
		postLog(`OK "${name}" ${compSize}→${data.length} bytes (${(performance.now() - t0).toFixed(1)}ms)`, minimal);
		return { name, data };
	} catch (e) {
		postLog(`Failed to decompress "${name}": ${e}`, minimal);
		return null;
	}
}

function parseCentralDirectory(b: Uint8Array, minimal: boolean): FixEntry[] | null {
	let eocdPos = -1;
	for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
		if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x05 && b[i + 3] === 0x06) {
			eocdPos = i; break;
		}
	}
	if (eocdPos === -1) { postLog('No EOCD found', minimal); return null; }
	postLog(`EOCD at offset ${eocdPos}`, minimal);

	let cdCount = r16(b, eocdPos + 8);
	let cdOffset = r32(b, eocdPos + 16);
	postLog(`EOCD cdCount=${cdCount} cdOffset=0x${cdOffset.toString(16)}`, minimal);

	if (cdOffset === 0xffffffff || cdCount === 0xffff) {
		const z64Loc = eocdPos - 20;
		if (z64Loc >= 0 && b[z64Loc] === 0x50 && b[z64Loc + 1] === 0x4b && b[z64Loc + 2] === 0x06 && b[z64Loc + 3] === 0x07) {
			const z64Eocd = r32(b, z64Loc + 8);
			if (z64Eocd + 56 <= b.length) {
				cdCount = r32(b, z64Eocd + 32);
				cdOffset = r32(b, z64Eocd + 48);
			}
		}
	}

	if (cdOffset >= b.length) { postLog(`cdOffset 0x${cdOffset.toString(16)} out of range`, minimal); return null; }
	postLog(`Scanning central directory from 0x${cdOffset.toString(16)}`, minimal);

	const entries: FixEntry[] = [];
	let pos = cdOffset;
	while (pos + 46 <= b.length) {
		if (b[pos] !== 0x50 || b[pos + 1] !== 0x4b || b[pos + 2] !== 0x01 || b[pos + 3] !== 0x02) break;

		const method = r16(b, pos + 10);
		let compSize = r32(b, pos + 20);
		let uncompSize = r32(b, pos + 24);
		const nameLen = r16(b, pos + 28);
		const extraLen = r16(b, pos + 30);
		const commentLen = r16(b, pos + 32);
		let localOffset = r32(b, pos + 42);
		const name = new TextDecoder().decode(b.subarray(pos + 46, pos + 46 + nameLen));

		if (compSize === 0xffffffff || uncompSize === 0xffffffff || localOffset === 0xffffffff) {
			let xp = pos + 46 + nameLen, xe = xp + extraLen;
			while (xp + 4 <= xe) {
				const id = r16(b, xp), sz = r16(b, xp + 2);
				if (id === 0x0001) {
					let zp = xp + 4;
					if (uncompSize === 0xffffffff && zp + 8 <= xe) { uncompSize = r32(b, zp); zp += 8; }
					if (compSize === 0xffffffff && zp + 8 <= xe) { compSize = r32(b, zp); zp += 8; }
					if (localOffset === 0xffffffff && zp + 8 <= xe) { localOffset = r32(b, zp); }
					break;
				}
				xp += 4 + sz;
			}
		}

		pos += 46 + nameLen + extraLen + commentLen;
		if (name.endsWith('/')) continue;

		postLog(`CD entry: "${name}" method=${method} compSize=${compSize} localOffset=0x${localOffset.toString(16)}`, minimal);

		if (localOffset + 30 > b.length) { postLog(`localOffset out of range for "${name}"`, minimal); continue; }
		const lhNameLen = r16(b, localOffset + 26);
		const lhExtraLen = r16(b, localOffset + 28);
		const dataStart = localOffset + 30 + lhNameLen + lhExtraLen;
		if (dataStart + compSize > b.length) { postLog(`Data out of range for "${name}"`, minimal); continue; }

		const entry = decompressEntry(b, dataStart, compSize, method, name, minimal);
		if (entry) entries.push(entry);
	}
	return entries;
}

function parseLocalHeadersFallback(b: Uint8Array, minimal: boolean): FixEntry[] {
	postLog('Starting local-header fallback scan', minimal);
	const entries: FixEntry[] = [];
	let pos = 0;

	while (pos + 30 <= b.length) {
		if (b[pos] !== 0x50 || b[pos + 1] !== 0x4b || b[pos + 2] !== 0x03 || b[pos + 3] !== 0x04) {
			pos++; continue;
		}

		const flags = r16(b, pos + 6);
		const method = r16(b, pos + 8);
		let compSize = r32(b, pos + 18);
		const nameLen = r16(b, pos + 26);
		const extraLen = r16(b, pos + 28);
		const name = new TextDecoder().decode(b.subarray(pos + 30, pos + 30 + nameLen));
		const dataStart = pos + 30 + nameLen + extraLen;
		postLog(`LFH: "${name}" method=${method} compSize=${compSize} pos=0x${pos.toString(16)}`, minimal);

		if (name.endsWith('/')) { pos = dataStart + compSize; continue; }

		if (compSize === 0) {
			postLog(`compSize=0 for "${name}", scanning for boundary...`, minimal);
			for (let sp = dataStart; sp + 4 <= b.length; sp++) {
				const isPkDD = b[sp] === 0x50 && b[sp + 1] === 0x4b && b[sp + 2] === 0x07 && b[sp + 3] === 0x08;
				const isPkLFH = b[sp] === 0x50 && b[sp + 1] === 0x4b && b[sp + 2] === 0x03 && b[sp + 3] === 0x04;
				const isPkCD = b[sp] === 0x50 && b[sp + 1] === 0x4b && b[sp + 2] === 0x01 && b[sp + 3] === 0x02;
				if (isPkDD) {
					compSize = r32(b, sp + 8);
					postLog(`  found data descriptor at 0x${sp.toString(16)}, compSize=${compSize}`, minimal);
					break;
				}
				if (isPkLFH || isPkCD) {
					compSize = sp - dataStart;
					postLog(`  found next entry at 0x${sp.toString(16)}, compSize=${compSize}`, minimal);
					break;
				}
			}
		}

		const entry = decompressEntry(b, dataStart, compSize, method, name, minimal);
		if (entry) entries.push(entry);

		pos = dataStart + compSize;
		if (flags & 0x8) {
			pos += (b[pos] === 0x50 && b[pos + 1] === 0x4b && b[pos + 2] === 0x07 && b[pos + 3] === 0x08) ? 16 : 12;
		}
	}

	return entries;
}

ctx.onmessage = (e: MessageEvent<{ buffer: ArrayBuffer; minimal: boolean }>) => {
	const { buffer, minimal } = e.data;
	const b = new Uint8Array(buffer);
	const t0 = performance.now();
	postLog(`Input size: ${b.length} bytes`, minimal);

	try {
		let entries = parseCentralDirectory(b, minimal);
		if (!entries || entries.length === 0) {
			postLog('Central directory empty or invalid — falling back to local-header scan', minimal);
			entries = parseLocalHeadersFallback(b, minimal);
		} else {
			postLog(`Central directory: found ${entries.length} entries`, minimal);
		}

		postLog(`Parsed ${entries.length} entries in ${(performance.now() - t0).toFixed(0)}ms`, minimal);

		if (entries.length === 0) {
			ctx.postMessage({ type: 'error', message: 'No entries found — is this a valid ZIP/JAR?' });
			return;
		}

		const files: Parameters<typeof zipSync>[0] = {};
		for (const { name, data } of entries) {
			files[name] = [
				name.toLowerCase().endsWith('.png')
					? (() => { try { return fixPngCrc(data); } catch { return data; } })()
					: data,
				{ level: 0 },
			];
		}

		const t1 = performance.now();
		const zipped = zipSync(files);
		postLog(`zipSync took ${(performance.now() - t1).toFixed(0)}ms, output ${zipped.byteLength} bytes`, minimal);

		ctx.postMessage({ type: 'done', result: zipped.buffer }, [zipped.buffer as ArrayBuffer]);
	} catch (err) {
		ctx.postMessage({ type: 'error', message: String(err) });
	}
};
