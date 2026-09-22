import { describe, expect, it } from 'vitest';
import { normalizeChatId } from '../nodes/OpenWa/helpers/chatId';
import { pairsToObject, parseCoordinate, parsePollOptions } from '../nodes/OpenWa/helpers/fields';

describe('normalizeChatId', () => {
	it('validates groups and normalizes contacts', () => {
		expect(normalizeChatId(' 120363012345678901@g.us ')).toBe('120363012345678901@g.us');
		expect(normalizeChatId('+972 50-123-4567')).toBe('972501234567@c.us');
		expect(normalizeChatId('123456789012345@lid')).toBe('123456789012345@lid');
	});

	it('rejects malformed input', () => {
		expect(() => normalizeChatId('@g.us')).toThrow('not a valid group ID');
		expect(() => normalizeChatId('')).toThrow('required');
	});
});

describe('parsePollOptions', () => {
	const send = { min: 2, max: 12 };

	it('trims and drops empty options', () => {
		expect(parsePollOptions([' Yes ', '', 'No', '  '], send)).toEqual(['Yes', 'No']);
	});

	it('accepts a single value from an expression', () => {
		expect(parsePollOptions('Only', { min: 0, max: 12 })).toEqual(['Only']);
	});

	it('enforces the bounds', () => {
		expect(() => parsePollOptions(['Yes'], send)).toThrow(
			'Between 2 and 12 poll options are required, got 1',
		);
		const thirteen = Array.from({ length: 13 }, (_, k) => `o${k}`);
		expect(() => parsePollOptions(thirteen, send)).toThrow('got 13');
		expect(parsePollOptions([], { min: 0, max: 12 })).toEqual([]);
	});

	it('rejects duplicates after trimming', () => {
		expect(() => parsePollOptions(['Yes', ' Yes'], send)).toThrow('"Yes" is listed more than once');
	});
});

describe('parseCoordinate', () => {
	it('accepts numbers and numeric strings in range', () => {
		expect(parseCoordinate(32.0853, 'latitude')).toBe(32.0853);
		expect(parseCoordinate(' 34.7818 ', 'longitude')).toBe(34.7818);
		expect(parseCoordinate(-90, 'latitude')).toBe(-90);
		expect(parseCoordinate(180, 'longitude')).toBe(180);
	});

	it('rejects out-of-range, empty and non-numeric values', () => {
		expect(() => parseCoordinate(90.1, 'latitude')).toThrow(
			'Latitude must be a number between -90 and 90',
		);
		expect(() => parseCoordinate(-181, 'longitude')).toThrow('Longitude must be');
		expect(() => parseCoordinate('', 'latitude')).toThrow('got ""');
		expect(() => parseCoordinate('north', 'latitude')).toThrow('got "north"');
		expect(() => parseCoordinate(undefined, 'longitude')).toThrow('Longitude must be');
	});
});

describe('pairsToObject', () => {
	it('builds an object from rows', () => {
		expect(
			pairsToObject([
				{ name: ' first ', value: 'Dana' },
				{ name: 'n', value: 3 },
			]),
		).toEqual({
			first: 'Dana',
			n: '3',
		});
		expect(pairsToObject(undefined)).toEqual({});
	});

	it('rejects empty and duplicate names', () => {
		expect(() => pairsToObject([{ name: '', value: 'x' }])).toThrow('needs a name');
		expect(() => pairsToObject([{ name: 'a' }, { name: 'a' }])).toThrow(
			'"a" is defined more than once',
		);
	});
});
