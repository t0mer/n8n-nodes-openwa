/**
 * Largest binary we send inline. OpenWA caps the request body at 25 MB by default and base64
 * inflates data by about a third, so anything above ~18 MB would be rejected by the gateway.
 */
export const MAX_BINARY_BYTES = 18 * 1024 * 1024;

export type MediaInput =
	| { source: 'url'; url: string }
	| { source: 'binary'; data: Buffer; mimeType?: string; fileName?: string };

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
			`The file is ${toMb(bytes)} MB, above the ${toMb(MAX_BINARY_BYTES)} MB limit for binary uploads (OpenWA's 25 MB request limit after base64 encoding). Host the file and send it by URL instead (up to 50 MiB).`,
		);
	}
}

/** Build the media part of a send request from a URL or a binary buffer. */
export function buildMediaBody(input: MediaInput): MediaBody {
	if (input.source === 'url') {
		const url = input.url.trim();
		const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url)?.[1].toLowerCase();
		if (scheme && scheme !== 'http' && scheme !== 'https') {
			throw new Error(`Media URL must use http or https, got "${scheme}:"`);
		}
		if (!/^https?:\/\/[^\s/?#]+\S*$/i.test(url)) {
			throw new Error(`"${url}" is not a valid URL`);
		}
		return { url };
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
