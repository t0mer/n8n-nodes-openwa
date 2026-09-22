const CONTACT_SUFFIXES = ['@c.us', '@lid'];

/**
 * Normalize a contact into a WhatsApp chat ID.
 * Accepts a phone number in any common format (`+972 50-123 4567`) or a full `@c.us` / `@lid` JID.
 */
export function normalizeContactId(input: string): string {
	const value = input.trim();
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
		throw new Error(`"${value}" is not a valid phone number — use international format, e.g. 972501234567`);
	}
	return `${digits}@c.us`;
}

/** Validate a group chat ID (`<id>@g.us`). */
export function validateGroupId(input: string): string {
	const value = input.trim();
	if (!/^[^@\s]+@g\.us$/.test(value)) {
		throw new Error(`"${value}" is not a valid group ID (expected <id>@g.us)`);
	}
	return value;
}

/** Parse a comma-separated list of numbers into `@c.us` mention IDs. */
export function parseMentions(input: string): string[] {
	return input
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0)
		.map(normalizeContactId);
}

/** The bare number/ID part of a chat ID, as expected by the check-number endpoint. */
export function chatIdUser(chatId: string): string {
	return chatId.split('@')[0];
}
