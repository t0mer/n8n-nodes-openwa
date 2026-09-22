export const SIZE_LIMITS_TEXT =
	'OpenWA accepts request bodies up to 25 MB (about 18 MB of binary data once base64-encoded) and media up to 50 MiB when sent by URL.';

export interface OpenWaErrorText {
	message: string;
	description?: string;
}

/** Map an OpenWA HTTP status to a user-facing message. `apiMessage` is the gateway's own error text. */
export function describeOpenWaError(
	status: number | undefined,
	apiMessage: string | undefined,
	sessionId?: string,
): OpenWaErrorText {
	const session = sessionId ? `Session "${sessionId}"` : 'The session';
	switch (status) {
		case 400:
			return { message: apiMessage || 'OpenWA rejected the request (400 Bad Request)' };
		case 401:
			return {
				message: 'Authentication failed — check your OpenWA API key in the credentials',
				description: apiMessage,
			};
		case 404:
			return {
				message: sessionId ? `${session} was not found on the OpenWA gateway` : apiMessage || 'Not found',
				description: sessionId ? apiMessage : undefined,
			};
		case 409:
			return {
				message: `${session} is not ready (disconnected, reconnecting or reloading). This is usually transient — retry shortly.`,
				description: apiMessage,
			};
		case 413:
			return { message: 'Media too large', description: SIZE_LIMITS_TEXT };
		case 501:
			return { message: apiMessage || 'Not supported by the active OpenWA engine' };
		case 503:
			return {
				message: 'OpenWA could not reach WhatsApp or its upstream proxy. This is retryable — try again shortly.',
				description: apiMessage,
			};
		default:
			return { message: apiMessage || `OpenWA request failed${status ? ` (HTTP ${status})` : ''}` };
	}
}

/** Pull the gateway's error message out of a NestJS-style body: `{ statusCode, message, error }`. */
export function extractApiMessage(body: unknown): string | undefined {
	if (typeof body === 'string') return body || undefined;
	if (!body || typeof body !== 'object') return undefined;
	const message = (body as { message?: unknown }).message;
	if (Array.isArray(message)) return message.join('; ');
	if (typeof message === 'string') return message;
	return undefined;
}
