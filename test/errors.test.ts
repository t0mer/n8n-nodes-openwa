import { describe, expect, it } from 'vitest';
import { describeOpenWaError, extractApiMessage } from '../nodes/OpenWa/transport/errors';

describe('extractApiMessage', () => {
	it('reads a NestJS error body', () => {
		expect(extractApiMessage({ message: 'Invalid API key', error: 'Unauthorized', statusCode: 401 })).toBe(
			'Invalid API key',
		);
	});

	it('joins validation message arrays', () => {
		expect(extractApiMessage({ message: ['chatId must be a string', 'text should not be empty'] })).toBe(
			'chatId must be a string; text should not be empty',
		);
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
		expect(describeOpenWaError(401, 'Invalid API key').message).toMatch(/check your OpenWA API key/);
	});

	it('names the session on 404 and 409', () => {
		expect(describeOpenWaError(404, 'Not Found', 'main').message).toContain('Session "main"');
		const conflict = describeOpenWaError(409, 'reloading', 'main');
		expect(conflict.message).toContain('Session "main"');
		expect(conflict.message).toMatch(/retry/i);
	});

	it('states the size limits on 413', () => {
		const { message, description } = describeOpenWaError(413, 'Payload Too Large');
		expect(message).toBe('Media too large');
		expect(description).toMatch(/25 MB.*18 MB.*50 MiB/);
	});

	it('marks 503 as retryable', () => {
		expect(describeOpenWaError(503, 'upstream').message).toMatch(/retryable/);
	});

	it('falls back to the API message or status', () => {
		expect(describeOpenWaError(500, 'boom').message).toBe('boom');
		expect(describeOpenWaError(500, undefined).message).toBe('OpenWA request failed (HTTP 500)');
	});
});
