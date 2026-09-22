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
	/** False when a 409 on this route means something else, e.g. a duplicate template name. */
	conflictIsSessionState = true,
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
			// Only blame the session when the gateway says so; a proxy 404 usually means a wrong Base URL.
			if (sessionId && /session/i.test(apiMessage ?? '')) {
				return {
					message: `${session} was not found on the OpenWA gateway`,
					description: apiMessage,
				};
			}
			// An unmatched route ("Cannot POST /api/api/…") or no message at all points at a wrong
			// Base URL; anything else is the gateway saying a message, template, etc. doesn't exist.
			if (!apiMessage || /^Cannot (GET|POST|PUT|PATCH|DELETE) \//.test(apiMessage)) {
				return {
					message: apiMessage || 'Not found',
					description:
						'Check that the Base URL in the credentials points at the OpenWA gateway (without /api).',
				};
			}
			return { message: apiMessage };
		case 409:
			if (!conflictIsSessionState) return { message: apiMessage || 'Conflict (HTTP 409)' };
			return {
				message: `${session} is not ready (disconnected, reconnecting or reloading). This is usually transient — retry shortly.`,
				description: apiMessage,
			};
		case 413:
			return {
				message: 'Media too large',
				description: apiMessage ? `${apiMessage}. ${SIZE_LIMITS_TEXT}` : SIZE_LIMITS_TEXT,
			};
		case 501:
			return { message: apiMessage || 'Not supported by the active OpenWA engine' };
		case 503:
			return {
				message:
					'OpenWA could not reach WhatsApp or its upstream proxy. This is retryable — try again shortly.',
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

interface HttpErrorLike {
	httpCode?: string | null;
	description?: string | null;
	message?: string;
	response?: { status?: number; data?: unknown };
	cause?: { response?: { status?: number; data?: unknown } };
}

/**
 * Read the status and gateway message from an error thrown by `httpRequestWithAuthentication`
 * (a NodeApiError carrying `httpCode`/`description`) or from a raw Axios-style error.
 */
export function parseHttpError(error: unknown): { status?: number; apiMessage?: string } {
	const err = (error ?? {}) as HttpErrorLike;
	const response = err.response ?? err.cause?.response;
	const status = Number(err.httpCode ?? response?.status) || undefined;
	const apiMessage =
		extractApiMessage(response?.data) ??
		(err.description || undefined) ??
		(err.message || undefined);
	return { status, apiMessage };
}
