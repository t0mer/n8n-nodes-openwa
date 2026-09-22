import { describe, expect, it, vi } from 'vitest';
import { PAGE_SIZE, fetchPaged } from '../nodes/OpenWa/helpers/pagination';

/** Fake endpoint over `total` numbered items. */
function endpoint(total: number) {
	return vi.fn(async (limit: number, offset: number) =>
		Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, k) => offset + k),
	);
}

describe('fetchPaged', () => {
	it('returns a single short page', async () => {
		const fetch = endpoint(3);
		expect(await fetchPaged(fetch)).toEqual([0, 1, 2]);
		expect(fetch.mock.calls).toEqual([[PAGE_SIZE, 0]]);
	});

	it('walks multiple pages', async () => {
		const fetch = endpoint(2500);
		const all = await fetchPaged(fetch);
		expect(all).toHaveLength(2500);
		expect(all[2499]).toBe(2499);
		expect(fetch.mock.calls).toEqual([
			[PAGE_SIZE, 0],
			[PAGE_SIZE, 1000],
			[PAGE_SIZE, 2000],
		]);
	});

	it('makes one extra empty request on an exact multiple of the page size', async () => {
		const fetch = endpoint(2000);
		expect(await fetchPaged(fetch)).toHaveLength(2000);
		expect(fetch).toHaveBeenCalledTimes(3);
		expect(fetch.mock.calls[2]).toEqual([PAGE_SIZE, 2000]);
	});

	it('stops at max and only requests what is left', async () => {
		const fetch = endpoint(5000);
		expect(await fetchPaged(fetch, 1200)).toHaveLength(1200);
		expect(fetch.mock.calls).toEqual([
			[PAGE_SIZE, 0],
			[200, 1000],
		]);
	});

	it('uses a small first page for a small max', async () => {
		const fetch = endpoint(5000);
		expect(await fetchPaged(fetch, 50)).toEqual(Array.from({ length: 50 }, (_, k) => k));
		expect(fetch.mock.calls).toEqual([[50, 0]]);
	});

	it('trims a page that ignores the limit', async () => {
		const fetch = vi.fn(async () => [1, 2, 3, 4, 5]);
		expect(await fetchPaged(fetch, 2)).toEqual([1, 2]);
	});
});
