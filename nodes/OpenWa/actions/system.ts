import {
	NodeApiError,
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type JsonObject,
} from 'n8n-workflow';
import { normalizeChatId, normalizeContactId } from '../helpers/chatId';
import { parseDateInTimezone } from '../helpers/fields';
import { fetchPagedWithTotal } from '../helpers/pagination';
import { openWaApiRequest } from '../transport/request';

/** The search endpoint rejects an offset above this. */
const MAX_SEARCH_OFFSET = 100000;

/** Run one System operation for item `i`. Every operation is sessionless. */
export async function executeSystem(
	ctx: IExecuteFunctions,
	i: number,
): Promise<IDataObject | IDataObject[]> {
	const operation = ctx.getNodeParameter('operation', i) as string;
	const request = (path: string, qs?: IDataObject, okStatuses?: number[]) =>
		openWaApiRequest.call(ctx, 'GET', `/api${path}`, {
			qs,
			itemIndex: i,
			conflictIsSessionState: false,
			okStatuses,
		}) as Promise<IDataObject>;
	const fail = (message: string) =>
		new NodeOperationError(ctx.getNode(), message, { itemIndex: i });
	const max = () =>
		(ctx.getNodeParameter('returnAll', i) as boolean)
			? undefined
			: (ctx.getNodeParameter('limit', i) as number);

	switch (operation) {
		case 'getOverview':
			return await request('/stats/overview');
		case 'getMessageStats':
			return await request('/stats/messages', {
				period: ctx.getNodeParameter('statsPeriod', i, '24h') as string,
			});
		case 'getSessionStats': {
			const sessionId = String(
				ctx.getNodeParameter('statsSession', i, '', { extractValue: true }) ?? '',
			).trim();
			if (!sessionId) throw fail('Session is required');
			return await request(`/stats/sessions/${encodeURIComponent(sessionId)}`);
		}
		case 'getSettings':
			return await request('/settings');
		case 'getHealth':
			return await request('/health');
		case 'getLiveness':
			return await request('/health/live');
		case 'getReadiness': {
			// A 503 carries the same { status, details } body, naming the dependency that is down.
			const result = await request('/health/ready', undefined, [503]);
			if (typeof result?.status !== 'string') {
				throw fail('OpenWA is not ready (HTTP 503) and did not say which dependency is down');
			}
			return result;
		}
		case 'getAuditLog': {
			const { keyId, ...qs } = pick(ctx.getNodeParameter('auditFilters', i, {}) as IDataObject);
			if (keyId) qs.apiKeyId = keyId;
			return await fetchPagedWithTotal(async (limit, offset) => {
				const page = await request('/audit', { ...qs, limit, offset });
				return { items: (page.data as IDataObject[]) ?? [], total: Number(page.total) || 0 };
			}, max());
		}
		case 'searchMessages': {
			const q = String(ctx.getNodeParameter('searchQuery', i, '') ?? '').trim();
			if (!q) throw fail('Query is required');
			const qs = { q, ...buildSearchFilters(ctx, i) };
			try {
				return await fetchPagedWithTotal(
					async (limit, offset) => {
						const page = await request('/search', { ...qs, limit, offset });
						return { items: (page.hits as IDataObject[]) ?? [], total: Number(page.total) || 0 };
					},
					max(),
					100,
					MAX_SEARCH_OFFSET,
				);
			} catch (error) {
				if (error instanceof NodeApiError && error.httpCode === '501') {
					// A fresh error: re-wrapping the mapped one would hand it back unchanged.
					throw new NodeApiError(ctx.getNode(), { message: error.message } as JsonObject, {
						message: 'No search provider is configured on the OpenWA server',
						description: `The gateway answered: ${error.message}`,
						httpCode: '501',
						itemIndex: i,
					});
				}
				// Already mapped by the request helper; re-wrapping returns the same error.
				throw new NodeApiError(ctx.getNode(), error as JsonObject, { itemIndex: i });
			}
		}
		default:
			throw fail(`Unsupported operation "${operation}"`);
	}
}

/** The Search Messages filters as query parameters (dates as epoch milliseconds). */
function buildSearchFilters(ctx: IExecuteFunctions, i: number): IDataObject {
	const filters = pick(ctx.getNodeParameter('searchFilters', i, {}) as IDataObject);
	const timeZone = ctx.getTimezone();
	if (filters.chatId) filters.chatId = normalizeChatId(filters.chatId);
	if (filters.from) filters.from = normalizeContactId(filters.from);
	for (const [key, label] of [
		['dateFrom', 'Date From'],
		['dateTo', 'Date To'],
	]) {
		if (filters[key] === undefined) continue;
		const time = parseDateInTimezone(filters[key], timeZone);
		if (!Number.isFinite(time)) {
			throw new Error(`${label} is not a valid date: "${String(filters[key])}"`);
		}
		filters[key] = time;
	}
	return filters;
}

/** The collection's non-empty values, trimmed. */
function pick(collection: IDataObject): IDataObject {
	const result: IDataObject = {};
	for (const [key, value] of Object.entries(collection)) {
		const text = typeof value === 'string' ? value.trim() : value;
		if (text !== '' && text !== undefined && text !== null) result[key] = text;
	}
	return result;
}
