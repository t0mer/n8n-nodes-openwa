import { describe, expect, it } from 'vitest';
import { normalizeChatId } from '../nodes/OpenWa/helpers/chatId';
import {
	pairsToObject,
	parseCoordinate,
	parseDateInTimezone,
	parsePollOptions,
} from '../nodes/OpenWa/helpers/fields';

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

describe('parseDateInTimezone', () => {
	it('reads an offset-less value in the given timezone', () => {
		// Israel is UTC+3 in October (daylight time) and UTC+2 in December.
		expect(parseDateInTimezone('2026-10-01T09:00:00', 'Asia/Jerusalem')).toBe(
			Date.UTC(2026, 9, 1, 6),
		);
		expect(parseDateInTimezone('2026-12-01T09:00:00.000', 'Asia/Jerusalem')).toBe(
			Date.UTC(2026, 11, 1, 7),
		);
		expect(parseDateInTimezone('2026-10-01 09:30', 'America/New_York')).toBe(
			Date.UTC(2026, 9, 1, 13, 30),
		);
		expect(parseDateInTimezone('2026-10-01', 'UTC')).toBe(Date.UTC(2026, 9, 1));
	});

	it('keeps values that carry their own offset, and epoch milliseconds', () => {
		expect(parseDateInTimezone('2026-10-01T09:00:00Z', 'Asia/Jerusalem')).toBe(
			Date.UTC(2026, 9, 1, 9),
		);
		expect(parseDateInTimezone('2026-10-01T09:00:00.000+03:00', 'UTC')).toBe(
			Date.UTC(2026, 9, 1, 6),
		);
		expect(parseDateInTimezone(1790000000000, 'Asia/Jerusalem')).toBe(1790000000000);
	});

	it('handles the day daylight time ends', () => {
		// 2026-10-25 02:00 IDT → 01:00 IST in Israel; 12:00 that day is UTC+2.
		expect(parseDateInTimezone('2026-10-25T12:00:00', 'Asia/Jerusalem')).toBe(
			Date.UTC(2026, 9, 25, 10),
		);
	});

	it('returns NaN for anything else', () => {
		expect(parseDateInTimezone('soon', 'UTC')).toBeNaN();
		expect(parseDateInTimezone('', 'UTC')).toBeNaN();
		expect(parseDateInTimezone(Number.NaN, 'UTC')).toBeNaN();
	});
});
