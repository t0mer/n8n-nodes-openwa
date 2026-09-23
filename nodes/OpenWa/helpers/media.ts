/**
 * Largest binary we send inline. OpenWA caps the request body at 25 MB by default and base64
 * inflates data by about a third, so anything above ~18 MB would be rejected by the gateway.
 */
export const MAX_BINARY_BYTES = 18 * 1024 * 1024;

export type MediaInput =
	| { source: 'url'; url: string }
	| { source: 'binary'; data: Buffer; mimeType?: string; fileName?: string }
	| { source: 'base64'; data: string; mimeType?: string; fileName?: string };

export interface MediaBody {
	url?: string;
	base64?: string;
	mimetype?: string;
	filename?: string;
}

const toMb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);

export function assertBinarySize(bytes: number): void {
	if (bytes > MAX_BINARY_BYTES) {
		throw new Error(
			`The file is ${toMb(bytes)} MB, above the ${toMb(MAX_BINARY_BYTES)} MB limit for binary and Base64 uploads (OpenWA's 25 MB request limit after base64 encoding). Host the file and send it by URL instead (up to 50 MiB).`,
		);
	}
}

/**
 * Clean up base64 text: drop a `data:<mime>;base64,` prefix (returning its MIME type) and
 * whitespace, then check it is standard base64 of at most MAX_BINARY_BYTES decoded bytes.
 */
export function parseBase64(text: string): { base64: string; mimeType?: string } {
	let base64 = String(text ?? '').trim();
	let mimeType: string | undefined;
	const dataUrl = /^data:([^,]*?);base64,/i.exec(base64);
	if (dataUrl) {
		mimeType = dataUrl[1].split(';')[0].trim() || undefined;
		base64 = base64.slice(dataUrl[0].length);
	}
	base64 = base64.replace(/\s+/g, '');
	if (!base64) throw new Error('The Base64 data is empty');
	if (base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
		throw new Error('The Base64 data is not valid base64');
	}
	assertBinarySize((base64.length / 4) * 3 - (base64.match(/=+$/)?.[0].length ?? 0));
	return { base64, mimeType };
}

/** Build the media part of a send request from a URL, a binary buffer, or base64 text. */
export function buildMediaBody(input: MediaInput): MediaBody {
	if (input.source === 'url') {
		const url = String(input.url ?? '').trim();
		const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url)?.[1].toLowerCase();
		if (scheme && scheme !== 'http' && scheme !== 'https') {
			throw new Error(`Media URL must use http or https, got "${scheme}:"`);
		}
		if (!/^https?:\/\/[^\s/?#]+\S*$/i.test(url)) {
			throw new Error(`"${url}" is not a valid URL`);
		}
		return { url };
	}

	if (input.source === 'base64') {
		const parsed = parseBase64(input.data);
		const mimetype = input.mimeType?.trim() || parsed.mimeType;
		if (!mimetype) {
			throw new Error('MIME Type is required with Base64 data (e.g. image/jpeg)');
		}
		const body: MediaBody = { base64: parsed.base64, mimetype };
		if (input.fileName) body.filename = input.fileName;
		return body;
	}

	if (input.data.length === 0) throw new Error('The binary file is empty');
	assertBinarySize(input.data.length);
	const body: MediaBody = {
		base64: input.data.toString('base64'),
		mimetype: input.mimeType || 'application/octet-stream',
	};
	if (input.fileName) body.filename = input.fileName;
	return body;
}

/** File name from a Content-Disposition header; `filename*=UTF-8''…` wins over `filename=`. */
export function parseContentDispositionFilename(header: unknown): string | undefined {
	if (typeof header !== 'string') return undefined;
	const extended = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(header);
	if (extended) {
		try {
			return decodeURIComponent(extended[2].trim()) || undefined;
		} catch {
			// Malformed percent-encoding: fall back to the plain filename parameter.
		}
	}
	const plain = /filename\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^;]+))/i.exec(header);
	const name = (plain?.[1]?.replace(/\\(.)/g, '$1') ?? plain?.[2])?.trim();
	return name || undefined;
}
