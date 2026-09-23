import { NodeApiError, type IHttpRequestOptions } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import { executeSystem } from '../nodes/OpenWa/actions/system';
import { isSessionless } from '../nodes/OpenWa/descriptions/common';
import { fetchPagedWithTotal } from '../nodes/OpenWa/helpers/pagination';
import { OpenWa } from '../nodes/OpenWa/OpenWa.node';
import { fakeContext, type Responder } from './fakeContext';

const base = 'https://wa.example.com/api';

async function run(params: Record<string, unknown>, response: unknown = { ok: true }) {
	const { ctx, calls } = fakeContext(params, response);
	const result = await executeSystem(ctx, 0);
	return { result, calls: calls.map(({ method, url, qs }) => ({ method, url, qs })) };
}

/** A gateway error as the request helper would receive it. */
const httpError =
	(status: number, message: string): Responder =>
	() =>
		Object.assign(new Error(message), { response: { status, data: { message } } });

/** Serve `rows` from a limit/offset endpoint wrapped as `{ [key]: page, total }`. */
const pagedRows =
	(rows: unknown[], key: string): Responder =>
	({ qs }: IHttpRequestOptions) => {
		const { limit, offset } = qs as { limit: number; offset: number };
		return { [key]: rows.slice(offset, offset + limit), total: rows.length };
	};

describe('system', () => {
	it('is sessionless and wired into the node', () => {
		expect(isSessionless('system', 'getHealth')).toBe(true);
		const node = new OpenWa().description;
		const resource = node.properties.find((p) => p.name === 'resource');
		expect(resource?.options).toContainEqual({ name: 'System', value: 'system' });
	});

	it.each([
		['getOverview', '/stats/overview'],
		['getSettings', '/settings'],
		['getHealth', '/health'],
		['getLiveness', '/health/live'],
	])('%s calls GET %s', async (operation, path) => {
		const { result, calls } = await run({ operation }, { status: 'ok' });
		expect(result).toEqual({ status: 'ok' });
		expect(calls).toEqual([{ method: 'GET', url: `${base}${path}`, qs: undefined }]);
	});

	it('get message stats sends the period', async () => {
		const { calls } = await run({ operation: 'getMessageStats', statsPeriod: '7d' });
		expect(calls).toEqual([{ method: 'GET', url: `${base}/stats/messages`, qs: { period: '7d' } }]);
	});

	it('get session stats encodes the session from the locator', async () => {
		const { calls } = await run({
			operation: 'getSessionStats',
			statsSession: { mode: 'id', value: ' s 1 ' },
		});
		expect(calls[0].url).toBe(`${base}/stats/sessions/s%201`);
		await expect(run({ operation: 'getSessionStats', statsSession: '' })).rejects.toThrow(
			'Session is required',
		);
	});

	describe('get readiness', () => {
		it('returns the body on 200', async () => {
			const ready = { status: 'ok', details: { mainDatabase: { status: 'up' } } };
			const { ctx, calls } = fakeContext(
				{ operation: 'getReadiness' },
				{
					statusCode: 200,
					body: ready,
				},
			);
			expect(await executeSystem(ctx, 0)).toEqual(ready);
			expect(calls[0]).toMatchObject({
				url: `${base}/health/ready`,
				ignoreHttpStatusErrors: true,
				returnFullResponse: true,
			});
		});

		it('outputs the 503 body instead of failing', async () => {
			const down = { status: 'error', details: { dataDatabase: { status: 'down' } } };
			const { result } = await run({ operation: 'getReadiness' }, { statusCode: 503, body: down });
			expect(result).toEqual(down);
		});

		it('fails clearly on a 503 without a body', async () => {
			await expect(
				run({ operation: 'getReadiness' }, { statusCode: 503, body: '' }),
			).rejects.toThrow('did not say which dependency is down');
		});

		it('still maps other error statuses', async () => {
			const error = await run(
				{ operation: 'getReadiness' },
				{ statusCode: 401, body: { message: 'Invalid API key' } },
			).catch((e: unknown) => e);
			expect(error).toBeInstanceOf(NodeApiError);
			expect((error as NodeApiError).httpCode).toBe('401');
			expect((error as NodeApiError).message).toMatch(/check your OpenWA API key/);
		});
	});

	describe('get audit log', () => {
		const rows = Array.from({ length: 250 }, (_, n) => ({ id: `a${n}` }));

		it('sends the trimmed filters and pages until total with Return All', async () => {
			const { ctx, calls } = fakeContext(
				{
					operation: 'getAuditLog',
					returnAll: true,
					auditFilters: {
						action: 'message_sent',
						severity: 'error',
						sessionId: ' s1 ',
						keyId: ' k1 ',
					},
				},
				pagedRows(rows, 'data'),
			);
			const result = await executeSystem(ctx, 0);
			expect(result).toHaveLength(250);
			expect(calls.map((c) => c.qs)).toEqual(
				[0, 100, 200].map((offset) => ({
					action: 'message_sent',
					severity: 'error',
					sessionId: 's1',
					apiKeyId: 'k1',
					limit: 100,
					offset,
				})),
			);
		});

		it('stops at the limit', async () => {
			const { ctx, calls } = fakeContext(
				{ operation: 'getAuditLog', returnAll: false, limit: 30 },
				pagedRows(rows, 'data'),
			);
			expect(await executeSystem(ctx, 0)).toEqual(rows.slice(0, 30));
			expect(calls.map((c) => c.qs)).toEqual([{ limit: 30, offset: 0 }]);
		});
	});

	describe('search messages', () => {
		it('requires a query', async () => {
			await expect(run({ operation: 'searchMessages', searchQuery: '  ' })).rejects.toThrow(
				'Query is required',
			);
		});

		it('normalizes the filters and converts dates to epoch ms', async () => {
			const { ctx, calls } = fakeContext(
				{
					operation: 'searchMessages',
					searchQuery: ' invoice ',
					returnAll: false,
					limit: 5,
					searchFilters: {
						sessionId: 's1',
						chatId: '+972 50-123-4567',
						from: '972501234567',
						direction: 'incoming',
						type: 'text',
						dateFrom: '2026-09-01T00:00:00',
						dateTo: '2026-09-02T00:00:00Z',
					},
					__timezone: 'Asia/Jerusalem',
				},
				{ hits: [{ messageId: 'm1' }], total: 1, tookMs: 3, provider: 'builtin-fts' },
			);
			expect(await executeSystem(ctx, 0)).toEqual([{ messageId: 'm1' }]);
			expect(calls[0].url).toBe(`${base}/search`);
			expect(calls[0].qs).toEqual({
				q: 'invoice',
				sessionId: 's1',
				chatId: '972501234567@c.us',
				from: '972501234567@c.us',
				direction: 'incoming',
				type: 'text',
				dateFrom: Date.parse('2026-08-31T21:00:00Z'),
				dateTo: Date.parse('2026-09-02T00:00:00Z'),
				limit: 5,
				offset: 0,
			});
		});

		it('rejects an invalid date', async () => {
			await expect(
				run({ operation: 'searchMessages', searchQuery: 'x', searchFilters: { dateFrom: 'soon' } }),
			).rejects.toThrow('Date From is not a valid date');
		});

		it('pages through all hits with Return All', async () => {
			const hits = Array.from({ length: 120 }, (_, n) => ({ messageId: `m${n}` }));
			const { ctx, calls } = fakeContext(
				{ operation: 'searchMessages', searchQuery: 'x', returnAll: true },
				pagedRows(hits, 'hits'),
			);
			expect(await executeSystem(ctx, 0)).toHaveLength(120);
			expect(calls).toHaveLength(2);
		});

		it('explains a 501 as a missing search provider', async () => {
			const error = await run(
				{ operation: 'searchMessages', searchQuery: 'x', returnAll: true },
				httpError(501, 'Search is not configured'),
			).catch((e: unknown) => e);
			expect(error).toBeInstanceOf(NodeApiError);
			expect((error as NodeApiError).message).toBe(
				'No search provider is configured on the OpenWA server',
			);
			expect((error as NodeApiError).httpCode).toBe('501');
		});

		it('keeps other errors as mapped', async () => {
			await expect(
				run(
					{ operation: 'searchMessages', searchQuery: 'x', returnAll: true },
					httpError(400, 'q must not be empty'),
				),
			).rejects.toThrow('q must not be empty');
		});
	});
});

describe('fetchPagedWithTotal', () => {
	it('stops at an empty page even if total says more', async () => {
		let calls = 0;
		const result = await fetchPagedWithTotal(
			async () => {
				calls++;
				return { items: calls === 1 ? [1, 2] : [], total: 10 };
			},
			undefined,
			2,
		);
		expect(result).toEqual([1, 2]);
		expect(calls).toBe(2);
	});

	it('does not request past the max offset', async () => {
		const offsets: number[] = [];
		const result = await fetchPagedWithTotal(
			async (limit, offset) => {
				offsets.push(offset);
				return { items: Array(limit).fill(0), total: 1000 };
			},
			undefined,
			10,
			20,
		);
		expect(offsets).toEqual([0, 10, 20]);
		expect(result).toHaveLength(30);
	});
});
