/** Largest page OpenWA list endpoints accept. */
export const PAGE_SIZE = 1000;

/**
 * Collect results from a limit/offset endpoint. Stops at the first short page, once `max` items
 * are collected when `max` is given, or when a page repeats the previous one (a server that
 * ignores `offset` would otherwise loop forever).
 */
export async function fetchPaged<T>(
	fetchPage: (limit: number, offset: number) => Promise<T[]>,
	max?: number,
): Promise<T[]> {
	const results: T[] = [];
	let previousFirst: string | undefined;
	for (;;) {
		const limit = Math.min(PAGE_SIZE, max === undefined ? PAGE_SIZE : max - results.length);
		if (limit <= 0) return results;
		const page = await fetchPage(limit, results.length);
		const first = page.length ? JSON.stringify(page[0]) : undefined;
		if (first !== undefined && first === previousFirst) return results;
		previousFirst = first;
		results.push(...page.slice(0, limit));
		if (page.length < limit) return results;
	}
}
