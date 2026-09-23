import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { normalizeChatId, parseContactList } from '../helpers/chatId';

/**
 * Check an `X-OpenWA-Signature: sha256=<hex>` header: HMAC-SHA256 of the raw request body with
 * the webhook secret, compared in constant time.
 */
export function verifySignature(
	rawBody: Buffer | string | undefined,
	header: unknown,
	secret: string,
): boolean {
	if (!rawBody || typeof header !== 'string' || !secret) return false;
	const expected = Buffer.from(
		`sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`,
	);
	const received = Buffer.from(header.trim());
	return received.length === expected.length && timingSafeEqual(received, expected);
}

/**
 * The signing secret for one trigger node, derived from the API key and a scope that is the
 * same at registration and at delivery (workflow and node ID). Nothing is stored, so
 * verification can't fail open, and rotating the API key changes it.
 */
export function deriveWebhookSecret(apiKey: string, scope: string): string {
	return createHmac('sha256', apiKey).update(`openwa-trigger:${scope}`).digest('hex');
}

/** A short, non-reversible tag of a secret, for noticing that it changed. */
export function secretTag(secret: string): string {
	return createHash('sha256').update(secret).digest('hex').slice(0, 16);
}

export interface MessageFilterOptions {
	onlyFrom?: unknown;
	onlyInChat?: unknown;
	bodyContains?: unknown;
	chatType?: unknown;
	ignoreFromMe?: unknown;
}

export interface FilterCondition {
	field: string;
	operator: 'is' | 'isNot' | 'contains' | 'equals';
	value: string | string[] | boolean;
}

/**
 * The only events whose payload carries the message fields filters test (sender, chat, body,
 * flags). Any other event, including other families, would be silently dropped by a filter.
 */
export const FILTERABLE_EVENTS = [
	'message.received',
	'message.sent',
	'message.edited',
	'message.revoked',
];

/** Turn the trigger's filter options into the gateway's `filters` object, or undefined for none. */
export function buildMessageFilters(
	options: MessageFilterOptions,
): { conditions: FilterCondition[] } | undefined {
	const conditions: FilterCondition[] = [];

	const senders = parseContactList(options.onlyFrom);
	if (senders.length) conditions.push({ field: 'sender', operator: 'is', value: senders });

	const chatEntries = Array.isArray(options.onlyInChat)
		? options.onlyInChat
		: String(options.onlyInChat ?? '').split(',');
	const chats = chatEntries
		.map((entry) => String(entry ?? '').trim())
		.filter((entry) => entry.length > 0)
		.map(normalizeChatId);
	if (chats.length) conditions.push({ field: 'chatId', operator: 'is', value: chats });

	const body = String(options.bodyContains ?? '').trim();
	if (body) conditions.push({ field: 'body', operator: 'contains', value: body });

	if (options.chatType === 'group' || options.chatType === 'direct') {
		conditions.push({ field: 'isGroup', operator: 'equals', value: options.chatType === 'group' });
	}
	if (options.ignoreFromMe === true) {
		conditions.push({ field: 'fromMe', operator: 'equals', value: false });
	}

	return conditions.length ? { conditions } : undefined;
}

/**
 * Remember a delivery's idempotency key. Returns true when it was already seen (a duplicate);
 * otherwise records it, keeping at most `max` recent keys.
 */
export function rememberDelivery(keys: string[], key: string | undefined, max = 200): boolean {
	if (!key) return false;
	if (keys.includes(key)) return true;
	keys.push(key);
	if (keys.length > max) keys.splice(0, keys.length - max);
	return false;
}
