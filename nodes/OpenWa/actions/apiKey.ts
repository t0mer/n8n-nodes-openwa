import {
	NodeApiError,
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type IHttpRequestMethods,
	type JsonObject,
} from 'n8n-workflow';
import { parseDateInTimezone } from '../helpers/fields';
import { openWaApiRequest } from '../transport/request';

const LIST_FIELDS = ['allowedIps', 'allowedSessions', 'allowedChats'];

/** Run one API Key operation for item `i`. Every operation is sessionless. */
export async function executeApiKey(
	ctx: IExecuteFunctions,
	i: number,
): Promise<IDataObject | IDataObject[]> {
	const operation = ctx.getNodeParameter('operation', i) as string;
	const request = (method: IHttpRequestMethods, path: string, body?: IDataObject) =>
		openWaApiRequest.call(ctx, method, `/api/auth${path}`, {
			body,
			itemIndex: i,
			// A 409 here means the change would remove the last usable admin key.
			conflictIsSessionState: false,
		}) as Promise<IDataObject | IDataObject[]>;
	const fail = (message: string) =>
		new NodeOperationError(ctx.getNode(), message, { itemIndex: i });
	const timeZone = ctx.getTimezone();

	switch (operation) {
		case 'validate':
			try {
				return await request('POST', '/validate');
			} catch (error) {
				// The gateway answers 401 for an invalid key; report that as a result, not a failure.
				if (error instanceof NodeApiError && error.httpCode === '401') return { valid: false };
				// Already mapped by the request helper; re-wrapping returns the same error.
				throw new NodeApiError(ctx.getNode(), error as JsonObject, { itemIndex: i });
			}
		case 'getAll': {
			const keys = (await request('GET', '/api-keys')) as IDataObject[];
			if (ctx.getNodeParameter('returnAll', i) as boolean) return keys;
			return keys.slice(0, ctx.getNodeParameter('limit', i) as number);
		}
		case 'create': {
			const name = String(ctx.getNodeParameter('keyName', i) ?? '').trim();
			if (!name) throw fail('Name is required');
			const options = ctx.getNodeParameter('apiKeyOptions', i, {}) as IDataObject;
			const body: IDataObject = {
				name,
				role: ctx.getNodeParameter('apiKeyRole', i, 'operator') as string,
			};
			for (const field of LIST_FIELDS) {
				const list = parseList(options[field]);
				if (list.length) body[field] = list;
			}
			if (!isEmpty(options.expiresAt)) body.expiresAt = toIso(options.expiresAt, timeZone);
			// The response carries the full `apiKey`, which the gateway never returns again.
			return await request('POST', '/api-keys', body);
		}
	}

	const id = String(ctx.getNodeParameter('apiKeyId', i, '', { extractValue: true }) ?? '').trim();
	if (!id) throw fail('API Key is required');
	const path = `/api-keys/${encodeURIComponent(id)}`;

	switch (operation) {
		case 'get':
			return await request('GET', path);
		case 'revoke':
			return await request('POST', `${path}/revoke`);
		case 'delete':
			// 204 with no body.
			await request('DELETE', path);
			return { success: true, apiKeyId: id };
		case 'update':
			return await request('PUT', path, buildUpdate(ctx, i, timeZone));
		default:
			throw fail(`Unsupported operation "${operation}"`);
	}
}

/** The Update Fields as an UpdateApiKeyDto. An empty list field clears that restriction. */
function buildUpdate(ctx: IExecuteFunctions, i: number, timeZone: string): IDataObject {
	const fields = ctx.getNodeParameter('apiKeyUpdateFields', i, {}) as IDataObject;
	const body: IDataObject = {};
	if (fields.name !== undefined) {
		const name = String(fields.name ?? '').trim();
		if (!name) throw new Error('Name must not be empty');
		body.name = name;
	}
	if (fields.role !== undefined) body.role = String(fields.role);
	for (const field of LIST_FIELDS) {
		if (fields[field] !== undefined) body[field] = parseList(fields[field]);
	}
	if (fields.expiresAt !== undefined) {
		if (isEmpty(fields.expiresAt)) throw new Error('Expires At must not be empty');
		body.expiresAt = toIso(fields.expiresAt, timeZone);
	}
	if (!Object.keys(body).length) throw new Error('Add at least one field to update');
	return body;
}

/** A comma-separated string (or an array from an expression) as trimmed, non-empty entries. */
export function parseList(value: unknown): string[] {
	const parts = Array.isArray(value) ? value : String(value ?? '').split(',');
	return parts.map((part) => String(part ?? '').trim()).filter(Boolean);
}

function isEmpty(value: unknown): boolean {
	return value === undefined || value === null || String(value).trim() === '';
}

function toIso(value: unknown, timeZone: string): string {
	const time = parseDateInTimezone(value, timeZone);
	if (!Number.isFinite(time)) throw new Error(`Expires At is not a valid date: "${String(value)}"`);
	return new Date(time).toISOString();
}
