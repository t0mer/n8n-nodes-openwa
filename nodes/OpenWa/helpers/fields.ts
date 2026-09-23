/** Trim, drop empty entries and reject duplicates in a list of poll options. */
export function parsePollOptions(
	values: unknown,
	{ min, max }: { min: number; max: number },
): string[] {
	const list = (Array.isArray(values) ? values : [values])
		.map((value) => String(value ?? '').trim())
		.filter((value) => value.length > 0);
	const duplicate = list.find((value, index) => list.indexOf(value) !== index);
	if (duplicate !== undefined)
		throw new Error(`Poll option "${duplicate}" is listed more than once`);
	if (list.length < min || list.length > max) {
		throw new Error(
			min === max
				? `Exactly ${min} poll options are required, got ${list.length}`
				: `Between ${min} and ${max} poll options are required, got ${list.length}`,
		);
	}
	return list;
}

const COORDINATE_RANGE = { latitude: 90, longitude: 180 };

/** Parse a latitude or longitude, accepting numbers or numeric strings from expressions. */
export function parseCoordinate(value: unknown, kind: 'latitude' | 'longitude'): number {
	const text = String(value ?? '').trim();
	const number = text === '' ? NaN : Number(text);
	const range = COORDINATE_RANGE[kind];
	if (!Number.isFinite(number) || Math.abs(number) > range) {
		throw new Error(
			`${kind[0].toUpperCase()}${kind.slice(1)} must be a number between -${range} and ${range}, got "${text}"`,
		);
	}
	return number;
}

/** Turn name/value rows (from a fixedCollection) into an object. */
export function pairsToObject(
	pairs: Array<{ name?: unknown; value?: unknown }> | undefined,
): Record<string, string> {
	const result: Record<string, string> = {};
	for (const pair of pairs ?? []) {
		const name = String(pair.name ?? '').trim();
		if (!name) throw new Error('Every variable needs a name');
		if (name in result) throw new Error(`Variable "${name}" is defined more than once`);
		result[name] = String(pair.value ?? '');
	}
	return result;
}

/** The offset of `timeZone` from UTC at `epoch`, in milliseconds. */
function zoneOffset(epoch: number, timeZone: string): number {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat('en-US', {
			timeZone,
			hourCycle: 'h23',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
		})
			.formatToParts(new Date(epoch))
			.map((part) => [part.type, Number(part.value)]),
	);
	const wallClock = Date.UTC(
		parts.year,
		parts.month - 1,
		parts.day,
		parts.hour,
		parts.minute,
		parts.second,
	);
	return wallClock - Math.floor(epoch / 1000) * 1000;
}

/**
 * Parse a date as n8n's date picker gives it: an ISO string that usually has no offset and
 * means the workflow's timezone. A value with its own offset (or `Z`), or epoch milliseconds,
 * is kept as is. Returns epoch milliseconds, or NaN when it can't be parsed.
 */
export function parseDateInTimezone(value: unknown, timeZone: string): number {
	if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
	const text = String(value ?? '').trim();
	if (/(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(text)) return Date.parse(text);
	const match =
		/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?)?$/.exec(text);
	if (!match) return NaN;
	const [, y, mo, d, h = '0', mi = '0', s = '0', ms = '0'] = match;
	const wallClock = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s, +ms.padEnd(3, '0'));
	// Take the zone's offset at that moment, then re-check once so a DST change in between is honoured.
	let epoch = wallClock - zoneOffset(wallClock, timeZone);
	const corrected = wallClock - zoneOffset(epoch, timeZone);
	if (corrected !== epoch) epoch = corrected;
	return epoch;
}
