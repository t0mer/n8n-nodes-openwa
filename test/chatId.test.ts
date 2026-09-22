import { describe, expect, it } from 'vitest';
import {
	chatIdUser,
	parseContactList,
	parseInviteCode,
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
		expect(() => normalizeContactId('120363000000000000@g.us')).toThrow(
			'is a group ID, not a contact',
		);
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

describe('non-string expression values', () => {
	it('accepts numbers from expressions', () => {
		expect(normalizeContactId(972501234567)).toBe('972501234567@c.us');
		expect(parseMentions(972501234567)).toEqual(['972501234567@c.us']);
	});

	it('treats null/undefined as empty', () => {
		expect(() => normalizeContactId(undefined)).toThrow('required');
		expect(parseMentions(null)).toEqual([]);
		expect(() => validateGroupId(undefined)).toThrow('not a valid group ID');
	});
});

describe('parseContactList', () => {
	it('accepts a comma-separated string or an array', () => {
		expect(parseContactList('+972 50 123 4567, 123456789012345@lid')).toEqual([
			'972501234567@c.us',
			'123456789012345@lid',
		]);
		expect(parseContactList(['972501234567', ' ', 972509999999])).toEqual([
			'972501234567@c.us',
			'972509999999@c.us',
		]);
		expect(parseContactList(undefined)).toEqual([]);
	});

	it('rejects group IDs', () => {
		expect(() => parseContactList('120363012345678901@g.us')).toThrow(
			'is a group ID, not a contact',
		);
	});
});

describe('parseInviteCode', () => {
	it.each([
		['https://chat.whatsapp.com/AbCdEf123456', 'AbCdEf123456'],
		['chat.whatsapp.com/invite/AbCdEf123456', 'AbCdEf123456'],
		['https://chat.whatsapp.com/AbCdEf123456?mode=ac_t', 'AbCdEf123456'],
		[' AbCdEf123456 ', 'AbCdEf123456'],
	])('extracts the code from %j', (input, expected) => {
		expect(parseInviteCode(input)).toBe(expected);
	});

	it.each(['', 'abc', 'https://example.com/x', 'bad code!'])('rejects %j', (input) => {
		expect(() => parseInviteCode(input)).toThrow('not a valid group invite code or link');
	});
});
