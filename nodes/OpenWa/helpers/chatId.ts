const CONTACT_SUFFIXES = ['@c.us', '@lid'];

/**
 * Normalize a contact into a WhatsApp chat ID.
 * Accepts a phone number in any common format (`+972 50-123 4567`) or a full `@c.us` / `@lid` JID.
 */
export function normalizeContactId(input: unknown): string {
	const value = String(input ?? '').trim();
	if (!value) throw new Error('Phone number is required');

	if (value.includes('@')) {
		if (CONTACT_SUFFIXES.some((suffix) => value.endsWith(suffix)) && value.indexOf('@') > 0) {
			return value;
		}
		if (value.endsWith('@g.us')) {
			throw new Error(`"${value}" is a group ID — set Recipient Type to Group`);
		}
		throw new Error(`"${value}" is not a valid contact ID (expected <number>@c.us or <id>@lid)`);
	}

	const digits = value.replace(/[+\s\-().]/g, '');
	if (!/^\d+$/.test(digits)) {
		throw new Error(
			`"${value}" is not a valid phone number — use international format, e.g. 972501234567`,
		);
	}
	return `${digits}@c.us`;
}

/** Validate a group chat ID (`<id>@g.us`). */
export function validateGroupId(input: unknown): string {
	const value = String(input ?? '').trim();
	if (!/^[^@\s]+@g\.us$/.test(value)) {
		throw new Error(`"${value}" is not a valid group ID (expected <id>@g.us)`);
	}
	return value;
}

/** Parse a comma-separated list of numbers into `@c.us` mention IDs. */
export function parseMentions(input: unknown): string[] {
	return parseContactList(input);
}

/**
 * Parse contacts given as a comma-separated string or an array (e.g. from an expression) into
 * normalized contact IDs. Group IDs are rejected.
 */
export function parseContactList(input: unknown): string[] {
	const entries = Array.isArray(input) ? input : String(input ?? '').split(',');
	return entries
		.map((entry) => String(entry ?? '').trim())
		.filter((entry) => entry.length > 0)
		.map(normalizeContactId);
}

/** The code from a group invite link (https://chat.whatsapp.com/<code>) or a bare code. */
export function parseInviteCode(input: unknown): string {
	const value = String(input ?? '').trim();
	const fromLink = /chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9]+)/i.exec(value);
	const code = fromLink ? fromLink[1] : value;
	if (!/^[A-Za-z0-9]{6,}$/.test(code)) {
		throw new Error(`"${value}" is not a valid group invite code or link`);
	}
	return code;
}

/** The bare number/ID part of a chat ID, as expected by the check-number endpoint. */
export function chatIdUser(chatId: string): string {
	return chatId.split('@')[0];
}

/** Normalize any single chat: a group (`@g.us`) or a contact (phone number, `@c.us`, `@lid`). */
export function normalizeChatId(input: unknown): string {
	const value = String(input ?? '').trim();
	return value.endsWith('@g.us') ? validateGroupId(value) : normalizeContactId(value);
}
