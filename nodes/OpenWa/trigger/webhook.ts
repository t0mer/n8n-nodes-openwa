import { createHmac, timingSafeEqual } from 'crypto';
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

/**
 * A short tag of a secret, for noticing that it changed. Keyed with the API key, so a tag kept
 * in static data can't be checked offline against guesses of a custom secret.
 */
export function secretTag(secret: string, apiKey: string): string {
	return createHmac('sha256', apiKey).update(secret).digest('hex').slice(0, 16);
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
	caseSensitive?: boolean;
}

const INVALID_JSON = Symbol('invalid JSON');

function parseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return INVALID_JSON;
	}
}

const FILTER_OPERATORS = ['is', 'isNot', 'contains', 'equals'];

/** Most conditions one webhook filter accepts. */
export const MAX_FILTER_CONDITIONS = 20;

/**
 * Validate raw filter conditions (a JSON string or an already parsed value): either
 * `{ "conditions": [...] }` or a bare array of `{ field, operator, value, caseSensitive? }`.
 * A single string with is/isNot is wrapped in an array, the only form the gateway accepts.
 * Returns the conditions, or throws an error naming the first problem.
 */
export function parseFilterConditions(value: unknown): FilterCondition[] {
	let parsed = value;
	if (typeof parsed === 'string') {
		parsed = parseJson(parsed);
		if (parsed === INVALID_JSON) throw new Error('Filter conditions are not valid JSON');
	}
	if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
		parsed = (parsed as { conditions?: unknown }).conditions;
	}
	if (!Array.isArray(parsed)) {
		throw new Error('Filter conditions must be an array, or an object with a "conditions" array');
	}
	if (parsed.length < 1 || parsed.length > MAX_FILTER_CONDITIONS) {
		throw new Error(
			`Filter conditions must have 1–${MAX_FILTER_CONDITIONS} entries, got ${parsed.length}`,
		);
	}
	return parsed.map((entry: unknown, index) => {
		const fail = (problem: string) => new Error(`Filter condition ${index + 1}: ${problem}`);
		if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
			throw fail('must be an object with field, operator and value');
		}
		const { field, operator, value, caseSensitive } = entry as Record<string, unknown>;
		if (typeof field !== 'string' || !field.trim())
			throw fail('"field" must be a non-empty string');
		if (typeof operator !== 'string' || !FILTER_OPERATORS.includes(operator)) {
			throw fail(`"operator" must be one of ${FILTER_OPERATORS.join(', ')}`);
		}
		const validValue =
			typeof value === 'string' ||
			typeof value === 'boolean' ||
			(Array.isArray(value) && value.every((item) => typeof item === 'string'));
		if (!validValue) throw fail('"value" must be a string, an array of strings, or a boolean');
		const listOperator = operator === 'is' || operator === 'isNot';
		// The gateway rejects booleans with contains/equals, and strings with is/isNot.
		if (typeof value === 'boolean' && !listOperator) {
			throw fail('a true/false value needs the operator is or isNot');
		}
		if (caseSensitive !== undefined && typeof caseSensitive !== 'boolean') {
			throw fail('"caseSensitive" must be a boolean');
		}
		const condition: FilterCondition = {
			field: field.trim(),
			operator: operator as FilterCondition['operator'],
			value:
				listOperator && typeof value === 'string' ? [value] : (value as FilterCondition['value']),
		};
		if (caseSensitive !== undefined) condition.caseSensitive = caseSensitive;
		return condition;
	});
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
		conditions.push({ field: 'isGroup', operator: 'is', value: options.chatType === 'group' });
	}
	if (options.ignoreFromMe === true) {
		conditions.push({ field: 'fromMe', operator: 'is', value: false });
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
