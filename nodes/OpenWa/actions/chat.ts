import {
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type IHttpRequestMethods,
} from 'n8n-workflow';
import { normalizeChatId } from '../helpers/chatId';
import { fetchPaged } from '../helpers/pagination';
import { openWaApiRequest } from '../transport/request';

/** Run one Chat operation for item `i`. Get Many returns one object per chat. */
export async function executeChat(
	ctx: IExecuteFunctions,
	i: number,
	sessionId: string,
): Promise<IDataObject | IDataObject[]> {
	const operation = ctx.getNodeParameter('operation', i) as string;
	const base = `/api/sessions/${encodeURIComponent(sessionId)}`;
	const request = (
		method: IHttpRequestMethods,
		path: string,
		{ body, qs }: { body?: IDataObject; qs?: IDataObject } = {},
	) =>
		openWaApiRequest.call(ctx, method, `${base}${path}`, {
			body,
			qs,
			sessionId,
			itemIndex: i,
		}) as Promise<IDataObject | IDataObject[]>;

	switch (operation) {
		case 'getAll': {
			const returnAll = ctx.getNodeParameter('returnAll', i) as boolean;
			const max = returnAll ? undefined : (ctx.getNodeParameter('limit', i) as number);
			return await fetchPaged(
				async (limit, offset) =>
					(await request('GET', '/chats', { qs: { limit, offset } })) as IDataObject[],
				max,
			);
		}
		default:
			throw new NodeOperationError(ctx.getNode(), `Unsupported operation "${operation}"`, {
				itemIndex: i,
			});
	}
}

/** The Chat field as a normalized chat ID. */
export function getChatId(ctx: IExecuteFunctions, i: number): string {
	try {
		return normalizeChatId(ctx.getNodeParameter('chatId', i));
	} catch (error) {
		throw new NodeOperationError(ctx.getNode(), error as Error, { itemIndex: i });
	}
}
