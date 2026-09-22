import { describe, expect, it, vi } from 'vitest';
import { PAGE_SIZE, fetchByCursor, fetchPaged } from '../nodes/OpenWa/helpers/pagination';

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

	it('returns nothing for an empty first page', async () => {
		const fetch = endpoint(0);
		expect(await fetchPaged(fetch)).toEqual([]);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('stops when the server ignores offset and repeats a full page', async () => {
		const page = Array.from({ length: PAGE_SIZE }, (_, k) => ({ id: k }));
		const fetch = vi.fn(async () => page);
		const all = await fetchPaged(fetch);
		expect(all).toHaveLength(PAGE_SIZE);
		expect(fetch).toHaveBeenCalledTimes(2);
	});
});

describe('fetchByCursor', () => {
	/** Fake keyset endpoint over ids 0..total-1, newest first is irrelevant here. */
	function cursorEndpoint(total: number) {
		return vi.fn(async (limit: number, after?: string) => {
			const start = after === undefined ? 0 : Number(after) + 1;
			return Array.from({ length: Math.max(0, Math.min(limit, total - start)) }, (_, k) => ({
				id: String(start + k),
			}));
		});
	}
	const id = (item: { id: string }) => item.id;

	it('walks pages using the last id as the cursor', async () => {
		const fetch = cursorEndpoint(250);
		const all = await fetchByCursor(fetch, id);
		expect(all).toHaveLength(250);
		expect(fetch.mock.calls).toEqual([
			[100, undefined],
			[100, '99'],
			[100, '199'],
		]);
	});

	it('stops at max and requests only what is left', async () => {
		const fetch = cursorEndpoint(1000);
		expect(await fetchByCursor(fetch, id, 150)).toHaveLength(150);
		expect(fetch.mock.calls).toEqual([
			[100, undefined],
			[50, '99'],
		]);
	});

	it('stops when the cursor does not move', async () => {
		const page = Array.from({ length: 100 }, () => ({ id: 'same' }));
		const fetch = vi.fn(async () => page);
		expect(await fetchByCursor(fetch, id)).toHaveLength(200);
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it('stops when rows have no id', async () => {
		const fetch = vi.fn(async () => Array.from({ length: 100 }, () => ({ id: '' })));
		expect(await fetchByCursor(fetch, id)).toHaveLength(100);
		expect(fetch).toHaveBeenCalledTimes(1);
	});
});
