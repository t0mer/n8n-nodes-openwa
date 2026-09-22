import { describe, expect, it } from 'vitest';
import {
	chatIdUser,
	normalizeContactId,
	parseMentions,
	validateGroupId,
} from '../nodes/OpenWa/helpers/chatId';

describe('normalizeContactId', () => {
	it.each([
		['972501234567', '972501234567@c.us'],
		['+972 50-123-4567', '972501234567@c.us'],
		['(972) 50 123 4567', '972501234567@c.us'],
		['  972501234567  ', '972501234567@c.us'],
	])('normalizes %j to %j', (input, expected) => {
		expect(normalizeContactId(input)).toBe(expected);
	});

	it('keeps full @c.us and @lid JIDs unchanged', () => {
		expect(normalizeContactId('972501234567@c.us')).toBe('972501234567@c.us');
		expect(normalizeContactId('123456789012345@lid')).toBe('123456789012345@lid');
	});

	it('rejects empty input', () => {
		expect(() => normalizeContactId('   ')).toThrow('required');
	});

	it('rejects a group ID with a hint to switch recipient type', () => {
		expect(() => normalizeContactId('120363000000000000@g.us')).toThrow('Recipient Type to Group');
	});

	it('rejects unknown JID suffixes and bare suffixes', () => {
		expect(() => normalizeContactId('123@s.whatsapp.net')).toThrow('not a valid contact ID');
		expect(() => normalizeContactId('@c.us')).toThrow('not a valid contact ID');
	});

	it('rejects non-numeric phone numbers', () => {
		expect(() => normalizeContactId('john')).toThrow('not a valid phone number');
		expect(() => normalizeContactId('97250abc')).toThrow('not a valid phone number');
	});
});

describe('validateGroupId', () => {
	it('accepts a group JID and trims it', () => {
		expect(validateGroupId(' 120363000000000000@g.us ')).toBe('120363000000000000@g.us');
	});

	it.each(['120363000000000000', '972501234567@c.us', '@g.us', ''])('rejects %j', (input) => {
		expect(() => validateGroupId(input)).toThrow('not a valid group ID');
	});
});

describe('parseMentions', () => {
	it('splits, trims, drops empties and normalizes', () => {
		expect(parseMentions('+972 50 123 4567, 972509999999@c.us,, ')).toEqual([
			'972501234567@c.us',
			'972509999999@c.us',
		]);
	});

	it('returns an empty list for blank input', () => {
		expect(parseMentions('')).toEqual([]);
	});

	it('throws on an invalid entry', () => {
		expect(() => parseMentions('972501234567, nope')).toThrow('not a valid phone number');
	});
});

describe('chatIdUser', () => {
	it('returns the part before @', () => {
		expect(chatIdUser('972501234567@c.us')).toBe('972501234567');
	});
});
