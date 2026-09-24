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
 * whitespace, turn URL-safe base64 into standard base64 and restore missing padding, then check
 * it is valid base64 of at most MAX_BINARY_BYTES decoded bytes.
 */
export function parseBase64(text: string): { base64: string; mimeType?: string } {
	let base64 = String(text ?? '').trim();
	let mimeType: string | undefined;
	const dataUrl = /^data:([^,]*?);base64,/i.exec(base64);
	if (dataUrl) {
		mimeType = dataUrl[1].split(';')[0].trim() || undefined;
		base64 = base64.slice(dataUrl[0].length);
	}
	base64 = base64.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
	if (!base64) throw new Error('The Base64 data is empty');
	const unpadded = base64.replace(/=+$/, '');
	if (base64.length - unpadded.length <= 2 && unpadded.length % 4 > 1) {
		base64 = unpadded.padEnd(unpadded.length + 4 - (unpadded.length % 4), '=');
	}
	if (base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
		throw new Error('The Base64 data is not valid base64');
	}
	assertBinarySize((base64.length / 4) * 3 - (base64.match(/=+$/)?.[0].length ?? 0));
	return { base64, mimeType };
}

/**
 * Build the media part of a send request from a URL, a binary buffer, or base64 text. With
 * `mimeTypeOptional`, base64 without a MIME type is sent without one (for endpoints that don't
 * need it).
 */
export function buildMediaBody(
	input: MediaInput,
	{ mimeTypeOptional = false }: { mimeTypeOptional?: boolean } = {},
): MediaBody {
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
		if (!mimetype && !mimeTypeOptional) {
			throw new Error('MIME Type is required with Base64 data (e.g. image/jpeg)');
		}
		const body: MediaBody = { base64: parsed.base64 };
		if (mimetype) body.mimetype = mimetype;
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

/** Extensions for MIME types whose subtype isn't the usual extension. */
const EXTENSIONS: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/svg+xml': 'svg',
	'audio/mpeg': 'mp3',
	'audio/mp4': 'm4a',
	'video/quicktime': 'mov',
	'text/plain': 'txt',
	'text/markdown': 'md',
	'application/msword': 'doc',
	'application/vnd.ms-excel': 'xls',
	'application/vnd.ms-powerpoint': 'ppt',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
	'application/vnd.oasis.opendocument.text': 'odt',
	'application/vnd.oasis.opendocument.spreadsheet': 'ods',
	'application/x-7z-compressed': '7z',
	'application/x-rar-compressed': 'rar',
	'application/vnd.rar': 'rar',
	'application/gzip': 'gz',
	'application/x-tar': 'tar',
};

/**
 * The file name to send with a document: `explicit` if set, else the media's own name, else
 * `file.<ext>` from the MIME type of inline data (OpenWA would otherwise name it just "file").
 */
export function documentFileName(explicit: string, media: MediaBody): string | undefined {
	if (explicit) return explicit;
	if (media.filename || !media.base64 || !media.mimetype) return media.filename;
	const mime = media.mimetype.split(';')[0].trim().toLowerCase();
	const subtype = mime.split('/')[1] ?? '';
	const extension = EXTENSIONS[mime] ?? (/^[a-z0-9]{1,5}$/.test(subtype) ? subtype : undefined);
	return extension && mime !== 'application/octet-stream' ? `file.${extension}` : undefined;
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
