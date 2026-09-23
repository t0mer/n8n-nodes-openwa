import {
	NodeApiError,
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type IHttpRequestMethods,
	type JsonObject,
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
		case 'archive':
		case 'unarchive':
			return await request('POST', '/chats/archive', {
				body: { chatId: getChatId(ctx, i), archive: operation === 'archive' },
			});
		case 'pin':
		case 'unpin':
			return await request('POST', '/chats/pin', {
				body: { chatId: getChatId(ctx, i), pin: operation === 'pin' },
			});
		case 'mute':
			return await request('POST', '/chats/mute', {
				body: { chatId: getChatId(ctx, i), muteUntil: getMuteUntil(ctx, i) },
			});
		case 'unmute':
			return await request('POST', '/chats/mute', {
				body: { chatId: getChatId(ctx, i), muteUntil: null },
			});
		case 'delete':
			return await request('POST', '/chats/delete', { body: { chatId: getChatId(ctx, i) } });
		case 'clearMessages':
			return await request('DELETE', `/chats/${encodeURIComponent(getChatId(ctx, i))}/messages`);
		case 'subscribePresence':
			return await request('POST', '/presence/subscribe', { body: { chatId: getChatId(ctx, i) } });
		case 'getPresence': {
			const chatId = getChatId(ctx, i);
			try {
				return await request('GET', `/presence/${encodeURIComponent(chatId)}`);
			} catch (error) {
				if (error instanceof NodeApiError && error.httpCode === '404') {
					error.message = `No presence reported yet for ${chatId}`;
					error.description =
						'Run Subscribe to Presence for this chat first, then wait for the contact to come online or type.';
				}
				throw new NodeApiError(ctx.getNode(), error as JsonObject, { itemIndex: i });
			}
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

/** A comma-separated string or an array, trimmed, without empty entries. */
function splitList(input: unknown): string[] {
	const entries = Array.isArray(input) ? input : String(input ?? '').split(',');
	return entries.map((entry) => String(entry ?? '').trim()).filter((entry) => entry.length > 0);
}

const MUTE_DURATIONS: Record<string, number> = {
	'8h': 8 * 60 * 60 * 1000,
	'1w': 7 * 24 * 60 * 60 * 1000,
};

/** When the mute should end, as epoch milliseconds (what the gateway expects). */
function getMuteUntil(ctx: IExecuteFunctions, i: number): number {
	const muteFor = ctx.getNodeParameter('muteFor', i, '8h') as string;
	if (MUTE_DURATIONS[muteFor]) return Date.now() + MUTE_DURATIONS[muteFor];
	const value = ctx.getNodeParameter('muteUntil', i, '') as string;
	const until = new Date(String(value ?? '')).getTime();
	if (!Number.isFinite(until)) {
		throw new NodeOperationError(ctx.getNode(), `Mute Until is not a valid date: "${value}"`, {
			itemIndex: i,
		});
	}
	if (until <= Date.now()) {
		throw new NodeOperationError(ctx.getNode(), 'Mute Until must be in the future', {
			itemIndex: i,
		});
	}
	return until;
}
