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
		case 'markRead': {
			const messageIds = splitList(ctx.getNodeParameter('messageIds', i, ''));
			return await request('POST', '/chats/read', {
				body: { chatId: getChatId(ctx, i), ...(messageIds.length ? { messageIds } : {}) },
			});
		}
		case 'markUnread':
			return await request('POST', '/chats/unread', { body: { chatId: getChatId(ctx, i) } });
		case 'sendChatState':
			return await request('POST', '/chats/typing', {
				body: { chatId: getChatId(ctx, i), state: ctx.getNodeParameter('chatState', i) as string },
			});
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

/** A comma-separated string or an array, trimmed, without empty entries. */
function splitList(input: unknown): string[] {
	const entries = Array.isArray(input) ? input : String(input ?? '').split(',');
	return entries.map((entry) => String(entry ?? '').trim()).filter((entry) => entry.length > 0);
}
