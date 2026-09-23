import {
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type IHttpRequestMethods,
} from 'n8n-workflow';
import { openWaApiRequest } from '../transport/request';
import { getChatId } from './chat';

/** Run one Label operation for item `i`. List operations return one object per label or chat. */
export async function executeLabel(
	ctx: IExecuteFunctions,
	i: number,
	sessionId: string,
): Promise<IDataObject | IDataObject[]> {
	const operation = ctx.getNodeParameter('operation', i) as string;
	const base = `/api/sessions/${encodeURIComponent(sessionId)}/labels`;
	const request = (method: IHttpRequestMethods, path: string, body?: IDataObject) =>
		openWaApiRequest.call(ctx, method, `${base}${path}`, {
			body,
			sessionId,
			itemIndex: i,
		}) as Promise<IDataObject | IDataObject[]>;
	const chatPath = () => `/chat/${encodeURIComponent(getChatId(ctx, i))}`;

	switch (operation) {
		case 'getAll': {
			const labels = (await request('GET', '')) as IDataObject[];
			if (ctx.getNodeParameter('returnAll', i) as boolean) return labels;
			return labels.slice(0, ctx.getNodeParameter('limit', i) as number);
		}
		case 'get':
			return await request('GET', `/${encodeURIComponent(getLabelId(ctx, i))}`);
		case 'upsert': {
			const id = requireText(ctx, i, 'labelId', 'Label ID').trim();
			const name = requireText(ctx, i, 'labelName', 'Name').trim();
			if (name.length > 100) {
				throw new NodeOperationError(ctx.getNode(), 'Name must be at most 100 characters', {
					itemIndex: i,
				});
			}
			return await request('PUT', `/${encodeURIComponent(id)}`, {
				name,
				color: Number(ctx.getNodeParameter('labelColor', i, 0)),
			});
		}
		case 'delete':
			return await request('DELETE', `/${encodeURIComponent(getLabelId(ctx, i))}`);
		case 'getChats':
			return await request('GET', `/${encodeURIComponent(getLabelId(ctx, i))}/chats`);
		case 'getChatLabels':
			return await request('GET', chatPath());
		case 'addToChat': {
			const labelId = getLabelId(ctx, i);
			return await request('POST', chatPath(), { labelId });
		}
		case 'removeFromChat': {
			const labelId = getLabelId(ctx, i);
			return await request('DELETE', `${chatPath()}/${encodeURIComponent(labelId)}`);
		}
		default:
			throw new NodeOperationError(ctx.getNode(), `Unsupported operation "${operation}"`, {
				itemIndex: i,
			});
	}
}

/** The selected label's ID. */
function getLabelId(ctx: IExecuteFunctions, i: number): string {
	const id = String(ctx.getNodeParameter('label', i, '', { extractValue: true }) ?? '').trim();
	if (!id) throw new NodeOperationError(ctx.getNode(), 'Label is required', { itemIndex: i });
	return id;
}

function requireText(ctx: IExecuteFunctions, i: number, name: string, label: string): string {
	const value = String(ctx.getNodeParameter(name, i) ?? '');
	if (!value.trim())
		throw new NodeOperationError(ctx.getNode(), `${label} is required`, { itemIndex: i });
	return value;
}
