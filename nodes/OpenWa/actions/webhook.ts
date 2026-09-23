import {
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type IHttpRequestMethods,
} from 'n8n-workflow';
import { fetchPaged } from '../helpers/pagination';
import { openWaApiRequest } from '../transport/request';
import { parseFilterConditions } from '../trigger/webhook';

/** Run one Webhook operation for item `i`. List operations return one object per row. */
export async function executeWebhook(
	ctx: IExecuteFunctions,
	i: number,
	sessionId: string,
): Promise<IDataObject | IDataObject[]> {
	const operation = ctx.getNodeParameter('operation', i) as string;
	const request = (
		method: IHttpRequestMethods,
		path: string,
		{ body, qs }: { body?: IDataObject; qs?: IDataObject } = {},
	) =>
		openWaApiRequest.call(ctx, method, path, {
			body,
			qs,
			sessionId: sessionId || undefined,
			itemIndex: i,
		}) as Promise<IDataObject | IDataObject[]>;
	const fail = (message: string) =>
		new NodeOperationError(ctx.getNode(), message, { itemIndex: i });
	const max = () =>
		(ctx.getNodeParameter('returnAll', i) as boolean)
			? undefined
			: (ctx.getNodeParameter('limit', i) as number);

	switch (operation) {
		case 'getAllSessions':
			return await fetchPaged(
				async (limit, offset) =>
					(await request('GET', '/api/webhooks', { qs: { limit, offset } })) as IDataObject[],
				max(),
			);
		case 'getDeliveryFailures': {
			const filterSession = String(ctx.getNodeParameter('webhookSessionId', i, '') ?? '').trim();
			return await fetchPaged(
				async (limit, offset) =>
					(await request('GET', '/api/webhooks/delivery-failures', {
						qs: { limit, offset, ...(filterSession ? { sessionId: filterSession } : {}) },
					})) as IDataObject[],
				max(),
			);
		}
	}

	const base = `/api/sessions/${encodeURIComponent(sessionId)}/webhooks`;
	switch (operation) {
		case 'getAll': {
			const webhooks = (await request('GET', base)) as IDataObject[];
			const limit = max();
			return limit === undefined ? webhooks : webhooks.slice(0, limit);
		}
		case 'create': {
			const url = String(ctx.getNodeParameter('webhookUrl', i) ?? '').trim();
			if (!url) throw fail('URL is required');
			const body: IDataObject = {
				url,
				events: getEvents(ctx.getNodeParameter('webhookEvents', i)),
			};
			const options = ctx.getNodeParameter('webhookOptions', i, {}) as IDataObject;
			const secret = String(options.secret ?? '');
			if (secret) body.secret = checkSecret(secret);
			const headers = getHeaders(options.headers);
			if (Object.keys(headers).length) body.headers = headers;
			const filters = getFilters(options.webhookFilters);
			if (filters) body.filters = filters;
			if (options.retryCount !== undefined) body.retryCount = checkRetryCount(options.retryCount);
			return await request('POST', base, { body });
		}
	}

	const webhookId = String(
		ctx.getNodeParameter('webhook', i, '', { extractValue: true }) ?? '',
	).trim();
	if (!webhookId) throw fail('Webhook is required');
	const path = `${base}/${encodeURIComponent(webhookId)}`;

	switch (operation) {
		case 'get':
			return await request('GET', path);
		case 'delete':
			// 204 with no body.
			await request('DELETE', path);
			return { success: true, webhookId };
		case 'test':
			return { ...((await request('POST', `${path}/test`)) as IDataObject), webhookId };
		case 'update':
			return await request('PUT', path, { body: buildUpdate(ctx, i) });
		default:
			throw fail(`Unsupported operation "${operation}"`);
	}
}

/** The Update Fields as an UpdateWebhookDto; at least one change is required. */
function buildUpdate(ctx: IExecuteFunctions, i: number): IDataObject {
	const fields = ctx.getNodeParameter('webhookUpdateFields', i, {}) as IDataObject;
	const body: IDataObject = {};
	if (fields.url !== undefined) {
		const url = String(fields.url ?? '').trim();
		if (!url) throw new Error('URL must not be empty');
		body.url = url;
	}
	if (fields.webhookEvents !== undefined) body.events = getEvents(fields.webhookEvents);
	if (fields.active !== undefined) body.active = fields.active === true;
	if (fields.retryCount !== undefined) body.retryCount = checkRetryCount(fields.retryCount);
	if (fields.headers !== undefined) body.headers = getHeaders(fields.headers);

	const secret = String(fields.secret ?? '');
	if (fields.clearSecret === true) {
		if (secret) throw new Error('Set either Secret or Clear Secret, not both');
		body.secret = '';
	} else if (secret) {
		body.secret = checkSecret(secret);
	}

	const filters = getFilters(fields.webhookFilters);
	if (fields.clearFilters === true) {
		if (filters) throw new Error('Set either Filters or Clear Filters, not both');
		body.filters = null;
	} else if (filters) {
		body.filters = filters;
	}

	if (!Object.keys(body).length) throw new Error('Add at least one field to update');
	return body;
}

function getEvents(value: unknown): string[] {
	const events = (Array.isArray(value) ? value : []).map(String).filter(Boolean);
	if (!events.length) throw new Error('Select at least one event');
	return events;
}

function checkSecret(secret: string): string {
	if (secret.length < 16 || secret.length > 255) {
		throw new Error('Secret must be 16–255 characters long');
	}
	return secret;
}

function checkRetryCount(value: unknown): number {
	const count = Number(value);
	if (!Number.isInteger(count) || count < 0 || count > 5) {
		throw new Error('Retry Count must be a whole number from 0 to 5');
	}
	return count;
}

/** Name/value pairs from the Headers fixedCollection as a plain map. */
function getHeaders(value: unknown): Record<string, string> {
	const entries = ((value as IDataObject | undefined)?.header ?? []) as IDataObject[];
	const headers: Record<string, string> = {};
	for (const entry of entries) {
		const name = String(entry.name ?? '').trim();
		if (!name) throw new Error('Every header needs a name');
		headers[name] = String(entry.value ?? '');
	}
	return headers;
}

/** The Filters (JSON) field as `{ conditions }`, or undefined when empty. */
function getFilters(value: unknown): IDataObject | undefined {
	if (value === undefined || value === null || String(value).trim() === '') return undefined;
	return { conditions: parseFilterConditions(value) as unknown as IDataObject[] };
}
