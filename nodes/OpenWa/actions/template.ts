import { NodeOperationError, type IDataObject, type IExecuteFunctions } from 'n8n-workflow';
import { openWaApiRequest } from '../transport/request';

/** Run one Template operation for item `i`. Get Many returns one object per template. */
export async function executeTemplate(
	ctx: IExecuteFunctions,
	i: number,
	sessionId: string,
): Promise<IDataObject | IDataObject[]> {
	const operation = ctx.getNodeParameter('operation', i) as string;
	const base = `/api/sessions/${encodeURIComponent(sessionId)}/templates`;
	const request = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: IDataObject) =>
		openWaApiRequest.call(ctx, method, `${base}${path}`, {
			body,
			sessionId,
			itemIndex: i,
			conflictIsSessionState: false,
		}) as Promise<IDataObject | IDataObject[]>;

	switch (operation) {
		case 'create': {
			const additional = ctx.getNodeParameter('additionalFields', i, {}) as IDataObject;
			return await request('POST', '', {
				name: requireText(ctx, i, 'templateName', 'Name'),
				body: requireText(ctx, i, 'templateBody', 'Body'),
				...pickText(additional, ['header', 'footer']),
			});
		}
		case 'get':
			return await request('GET', `/${encodeURIComponent(getTemplateId(ctx, i))}`);
		case 'getAll': {
			const templates = (await request('GET', '')) as IDataObject[];
			if (ctx.getNodeParameter('returnAll', i) as boolean) return templates;
			return templates.slice(0, ctx.getNodeParameter('limit', i) as number);
		}
		case 'update': {
			const id = getTemplateId(ctx, i);
			const fields = ctx.getNodeParameter('updateFields', i, {}) as IDataObject;
			const body = pickText(fields, ['name', 'body', 'header', 'footer']);
			if (Object.keys(body).length === 0) {
				throw new NodeOperationError(ctx.getNode(), 'Add at least one field to update', {
					itemIndex: i,
				});
			}
			return await request('PUT', `/${encodeURIComponent(id)}`, body);
		}
		case 'delete': {
			const id = getTemplateId(ctx, i);
			await request('DELETE', `/${encodeURIComponent(id)}`);
			return { success: true, id };
		}
		default:
			throw new NodeOperationError(ctx.getNode(), `Unsupported operation "${operation}"`, {
				itemIndex: i,
			});
	}
}

/** The selected template's ID. */
export function getTemplateId(ctx: IExecuteFunctions, i: number): string {
	const id = String(ctx.getNodeParameter('template', i, '', { extractValue: true }) ?? '').trim();
	if (!id) throw new NodeOperationError(ctx.getNode(), 'Template is required', { itemIndex: i });
	return id;
}

function requireText(ctx: IExecuteFunctions, i: number, name: string, label: string): string {
	const value = String(ctx.getNodeParameter(name, i) ?? '');
	if (!value.trim())
		throw new NodeOperationError(ctx.getNode(), `${label} is required`, { itemIndex: i });
	return value;
}

/** Copy the given keys from a collection, as strings. */
function pickText(source: IDataObject, keys: string[]): IDataObject {
	const result: IDataObject = {};
	for (const key of keys) {
		if (source[key] !== undefined) result[key] = String(source[key]);
	}
	return result;
}
