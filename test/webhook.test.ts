import { createHmac } from 'crypto';
import { describe, expect, it } from 'vitest';
import {
	buildMessageFilters,
	deriveWebhookSecret,
	secretTag,
	rememberDelivery,
	verifySignature,
} from '../nodes/OpenWa/trigger/webhook';

const signingKey = ['unit', 'test', 'signing', 'key'].join('-');
const body = Buffer.from('{"event":"message.received","data":{"body":"hi"}}');
const sign = (raw: Buffer | string, key = signingKey) =>
	`sha256=${createHmac('sha256', key).update(raw).digest('hex')}`;

describe('verifySignature', () => {
	it('accepts the HMAC-SHA256 of the raw body', () => {
		expect(verifySignature(body, sign(body), signingKey)).toBe(true);
		expect(verifySignature(body.toString(), ` ${sign(body)} `, signingKey)).toBe(true);
	});

	it('rejects a wrong signingKey, a changed body, and malformed or missing headers', () => {
		expect(verifySignature(body, sign(body, 'other-signingKey-0123456'), signingKey)).toBe(false);
		expect(verifySignature(Buffer.from('{"event":"x"}'), sign(body), signingKey)).toBe(false);
		expect(verifySignature(body, 'sha256=abc', signingKey)).toBe(false);
		expect(verifySignature(body, undefined, signingKey)).toBe(false);
		expect(verifySignature(undefined, sign(body), signingKey)).toBe(false);
		expect(verifySignature(body, sign(body), '')).toBe(false);
	});
});

describe('buildMessageFilters', () => {
	it('returns undefined when nothing is set', () => {
		expect(buildMessageFilters({})).toBeUndefined();
		expect(
			buildMessageFilters({ onlyFrom: ' ', chatType: 'any', ignoreFromMe: false }),
		).toBeUndefined();
	});

	it('builds conditions from every option', () => {
		expect(
			buildMessageFilters({
				onlyFrom: '+972 50-123-4567, 123456789012345@lid',
				onlyInChat: '120363012345678901@g.us, 972509999999',
				bodyContains: ' invoice ',
				chatType: 'group',
				ignoreFromMe: true,
			}),
		).toEqual({
			conditions: [
				{ field: 'sender', operator: 'is', value: ['972501234567@c.us', '123456789012345@lid'] },
				{
					field: 'chatId',
					operator: 'is',
					value: ['120363012345678901@g.us', '972509999999@c.us'],
				},
				{ field: 'body', operator: 'contains', value: 'invoice' },
				{ field: 'isGroup', operator: 'equals', value: true },
				{ field: 'fromMe', operator: 'equals', value: false },
			],
		});
	});

	it('maps direct chats to isGroup false and accepts arrays', () => {
		expect(buildMessageFilters({ chatType: 'direct', onlyInChat: ['972501234567'] })).toEqual({
			conditions: [
				{ field: 'chatId', operator: 'is', value: ['972501234567@c.us'] },
				{ field: 'isGroup', operator: 'equals', value: false },
			],
		});
	});

	it('rejects invalid IDs', () => {
		expect(() => buildMessageFilters({ onlyFrom: 'nope' })).toThrow('not a valid phone number');
		expect(() => buildMessageFilters({ onlyInChat: '@g.us' })).toThrow('not a valid group ID');
	});
});

describe('rememberDelivery', () => {
	it('flags repeats and keeps only the most recent keys', () => {
		const keys: string[] = [];
		expect(rememberDelivery(keys, 'a', 2)).toBe(false);
		expect(rememberDelivery(keys, 'a', 2)).toBe(true);
		expect(rememberDelivery(keys, 'b', 2)).toBe(false);
		expect(rememberDelivery(keys, 'c', 2)).toBe(false);
		expect(keys).toEqual(['b', 'c']);
		expect(rememberDelivery(keys, 'a', 2)).toBe(false);
	});

	it('never treats a missing key as a duplicate', () => {
		const keys: string[] = [];
		expect(rememberDelivery(keys, undefined)).toBe(false);
		expect(rememberDelivery(keys, undefined)).toBe(false);
		expect(keys).toEqual([]);
	});
});

describe('deriveWebhookSecret', () => {
	const apiKey = ['unit', 'test', 'api', 'key'].join('-');

	it('is stable for the same key and URL, and differs per URL and per key', () => {
		const prod = deriveWebhookSecret(apiKey, 'https://n8n.example.com/webhook/x/webhook');
		expect(prod).toMatch(/^[0-9a-f]{64}$/);
		expect(deriveWebhookSecret(apiKey, 'https://n8n.example.com/webhook/x/webhook')).toBe(prod);
		expect(deriveWebhookSecret(apiKey, 'https://n8n.example.com/webhook-test/x/webhook')).not.toBe(
			prod,
		);
		expect(
			deriveWebhookSecret(`${apiKey}-rotated`, 'https://n8n.example.com/webhook/x/webhook'),
		).not.toBe(prod);
	});

	it('tags a secret without revealing it', () => {
		const secret = deriveWebhookSecret(apiKey, 'u');
		expect(secretTag(secret)).toHaveLength(16);
		expect(secret).not.toContain(secretTag(secret));
		expect(secretTag(secret)).toBe(secretTag(secret));
	});
});
