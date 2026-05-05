// This just sorta manages workers
export type LogFn = (msg: string) => void;

export function fixPack(buffer: ArrayBuffer, onLog?: LogFn, minimal = true): Promise<Blob> {
	return new Promise((resolve, reject) => {
		const worker = new Worker(
			new URL('./packFixer.worker.ts', import.meta.url),
			{ type: 'module' }
		);

		worker.onmessage = (e: MessageEvent) => {
			const { type, msg, result, message } = e.data;
			if (type === 'log') {
				onLog?.(msg as string);
			} else if (type === 'done') {
				resolve(new Blob([result as ArrayBuffer], { type: 'application/zip' }));
				worker.terminate();
			} else if (type === 'error') {
				reject(new Error(message as string));
				worker.terminate();
			}
		};

		worker.onerror = (e: ErrorEvent) => {
			reject(new Error(e.message));
			worker.terminate();
		};

		// Transfer the buffer — zero-copy handoff, no duplication of the 14MB input.
		worker.postMessage({ buffer, minimal }, [buffer]);
	});
}
