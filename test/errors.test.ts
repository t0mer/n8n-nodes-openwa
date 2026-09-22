import { describe, expect, it } from 'vitest';
import {
	describeOpenWaError,
	extractApiMessage,
	parseHttpError,
} from '../nodes/OpenWa/transport/errors';

describe('extractApiMessage', () => {
	it('reads a NestJS error body', () => {
		expect(
			extractApiMessage({ message: 'Invalid API key', error: 'Unauthorized', statusCode: 401 }),
		).toBe('Invalid API key');
	});

	it('joins validation message arrays', () => {
		expect(
			extractApiMessage({ message: ['chatId must be a string', 'text should not be empty'] }),
		).toBe('chatId must be a string; text should not be empty');
	});

	it('decodes byte bodies from raw requests', () => {
		const json = JSON.stringify({ message: 'Media not found', statusCode: 404 });
		expect(extractApiMessage(Buffer.from(json))).toBe('Media not found');
		const bytes = new TextEncoder().encode(json);
		expect(
			extractApiMessage(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
		).toBe('Media not found');
		expect(extractApiMessage(Buffer.from('Bad Gateway'))).toBe('Bad Gateway');
		expect(extractApiMessage(json)).toBe('Media not found');
		expect(extractApiMessage('{not json')).toBe('{not json');
	});

	it('handles strings and unknown shapes', () => {
		expect(extractApiMessage('Bad Gateway')).toBe('Bad Gateway');
		expect(extractApiMessage(undefined)).toBeUndefined();
		expect(extractApiMessage({ foo: 1 })).toBeUndefined();
	});
});

describe('describeOpenWaError', () => {
	it('surfaces the API message for 400 and 501', () => {
		expect(describeOpenWaError(400, 'Session not active').message).toBe('Session not active');
		expect(describeOpenWaError(501, 'Not supported').message).toBe('Not supported');
	});

	it('tells the user to check credentials on 401', () => {
		expect(describeOpenWaError(401, 'Invalid API key').message).toMatch(
			/check your OpenWA API key/,
		);
	});

	it('names the session on 404 only when the gateway blames the session', () => {
		expect(describeOpenWaError(404, 'Session not found', 'main').message).toContain(
			'Session "main"',
		);
		const proxy404 = describeOpenWaError(404, 'Cannot POST /api/api/x', 'main');
		expect(proxy404.message).toBe('Cannot POST /api/api/x');
		expect(proxy404.description).toMatch(/Base URL/);
		expect(describeOpenWaError(404, undefined, 'main').description).toMatch(/Base URL/);
	});

	it('shows a resource 404 without the Base URL hint', () => {
		for (const text of [
			'Message not found',
			'Template not found',
			"Poll not found in the chat's recent history",
		]) {
			expect(describeOpenWaError(404, text, 'main')).toEqual({ message: text });
		}
	});

	it('names the session on 409', () => {
		const conflict = describeOpenWaError(409, 'reloading', 'main');
		expect(conflict.message).toContain('Session "main"');
		expect(conflict.message).toMatch(/retry/i);
	});

	it('surfaces the gateway message for a 409 that is not about session state', () => {
		const { message } = describeOpenWaError(
			409,
			'A template with that name already exists for the session',
			'main',
			false,
		);
		expect(message).toBe('A template with that name already exists for the session');
		expect(describeOpenWaError(409, undefined, 'main', false).message).toBe('Conflict (HTTP 409)');
	});

	it('states the size limits on 413', () => {
		const { message, description } = describeOpenWaError(413, 'Payload Too Large');
		expect(message).toBe('Media too large');
		expect(description).toMatch(/^Payload Too Large\. .*25 MB.*18 MB.*50 MiB/);
	});

	it('marks 503 as retryable', () => {
		expect(describeOpenWaError(503, 'upstream').message).toMatch(/retryable/);
	});

	it('falls back to the API message or status', () => {
		expect(describeOpenWaError(500, 'boom').message).toBe('boom');
		expect(describeOpenWaError(500, undefined).message).toBe('OpenWA request failed (HTTP 500)');
	});
});

describe('parseHttpError', () => {
	it('reads a NodeApiError-like error (httpCode + description)', () => {
		expect(
			parseHttpError({
				httpCode: '401',
				description: 'Invalid API key',
				message: 'Authorization failed',
			}),
		).toEqual({
			status: 401,
			apiMessage: 'Invalid API key',
		});
	});

	it('reads an Axios-style error via cause.response', () => {
		expect(
			parseHttpError({
				message: 'Request failed with status code 409',
				cause: {
					response: { status: 409, data: { message: 'Session is reloading', statusCode: 409 } },
				},
			}),
		).toEqual({ status: 409, apiMessage: 'Session is reloading' });
	});

	it('falls back to the error message for network errors', () => {
		expect(parseHttpError(new Error('connect ECONNREFUSED'))).toEqual({
			status: undefined,
			apiMessage: 'connect ECONNREFUSED',
		});
	});
});
