import { NodeOperationError, type IHttpRequestOptions } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import { executeCatalog } from '../nodes/OpenWa/actions/catalog';
import { OpenWa } from '../nodes/OpenWa/OpenWa.node';
import { fakeContext } from './fakeContext';

const base = 'https://wa.example.com/api/sessions/s1/catalog';

async function run(params: Record<string, unknown>, response: unknown) {
	const { ctx, calls } = fakeContext(params, response);
	const result = await executeCatalog(ctx, 0, 's1');
	return { result, calls: calls.map(({ method, url, qs }) => ({ method, url, qs })) };
}

/** A catalog of `total` products served `limit` per page, like the gateway does. */
function catalogOf(total: number) {
	const all = Array.from({ length: total }, (_, n) => ({ id: `p${n + 1}` }));
	return ({ qs }: IHttpRequestOptions) => {
		const { page, limit } = qs as { page: number; limit: number };
		return {
			products: all.slice((page - 1) * limit, page * limit),
			pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
		};
	};
}

describe('catalog', () => {
	it('get returns the catalog summary', async () => {
		const catalog = { id: 'c1', name: 'Default', productCount: 3, url: 'https://wa.me/c/1' };
		const { result, calls } = await run({ operation: 'get' }, catalog);
		expect(result).toEqual(catalog);
		expect(calls).toEqual([{ method: 'GET', url: base, qs: undefined }]);
	});

	it.each([[''], [null], [{}]])(
		'get outputs catalog: null for an empty body (%j)',
		async (body) => {
			expect((await run({ operation: 'get' }, body)).result).toEqual({ catalog: null });
		},
	);

	it('get product addresses the product by ID', async () => {
		const { result, calls } = await run(
			{ operation: 'getProduct', productId: ' 78/9 ' },
			{ id: '78/9', name: 'Coffee' },
		);
		expect(result).toEqual({ id: '78/9', name: 'Coffee' });
		expect(calls).toEqual([{ method: 'GET', url: `${base}/products/78%2F9`, qs: undefined }]);
	});

	it('get product throws a clear error on an empty body or a missing ID', async () => {
		await expect(run({ operation: 'getProduct', productId: 'p9' }, '')).rejects.toThrow(
			'Product "p9" not found',
		);
		await expect(run({ operation: 'getProduct', productId: ' ' }, {})).rejects.toBeInstanceOf(
			NodeOperationError,
		);
	});

	it('get products stops at the limit and sizes pages to it', async () => {
		const { result, calls } = await run(
			{ operation: 'getProducts', returnAll: false, limit: 3 },
			catalogOf(10),
		);
		expect(result).toEqual([{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]);
		expect(calls).toEqual([{ method: 'GET', url: `${base}/products`, qs: { page: 1, limit: 3 } }]);
	});

	it('get products with Return All walks every page', async () => {
		const { result, calls } = await run(
			{ operation: 'getProducts', returnAll: true },
			catalogOf(250),
		);
		expect(result).toHaveLength(250);
		expect((result as { id: string }[])[249]).toEqual({ id: 'p250' });
		expect(calls.map((c) => c.qs)).toEqual([
			{ page: 1, limit: 100 },
			{ page: 2, limit: 100 },
			{ page: 3, limit: 100 },
		]);
	});

	it('get products stops on the last page even when it is full', async () => {
		const { result, calls } = await run(
			{ operation: 'getProducts', returnAll: true },
			catalogOf(200),
		);
		expect(result).toHaveLength(200);
		expect(calls).toHaveLength(2);
	});

	it('get products stops when the gateway reports no pagination', async () => {
		const full = { products: Array.from({ length: 100 }, (_, n) => ({ id: n })) };
		const { calls } = await run({ operation: 'getProducts', returnAll: true }, full);
		expect(calls).toHaveLength(1);
		expect((await run({ operation: 'getProducts', returnAll: true }, '')).result).toEqual([]);
	});

	it('is wired into the node', () => {
		const { properties } = new OpenWa().description;
		const resource = properties.find((p) => p.name === 'resource');
		expect(resource?.options).toContainEqual({ name: 'Catalog', value: 'catalog' });
		const ops = properties.find(
			(p) => p.name === 'operation' && p.displayOptions?.show?.resource?.[0] === 'catalog',
		);
		expect(ops?.options?.map((o) => (o as { value: string }).value)).toEqual([
			'get',
			'getProduct',
			'getProducts',
		]);
	});
});
