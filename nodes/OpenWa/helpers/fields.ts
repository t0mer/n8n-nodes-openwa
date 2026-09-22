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
