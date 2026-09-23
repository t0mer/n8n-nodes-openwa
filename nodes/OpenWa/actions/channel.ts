import {
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type IHttpRequestMethods,
} from 'n8n-workflow';
import { normalizeContactId, parseChannelInviteCode, validateChannelId } from '../helpers/chatId';
import { openWaApiRequest } from '../transport/request';

/** Run one Channel operation for item `i`. List operations return one object per channel or post. */
export async function executeChannel(
	ctx: IExecuteFunctions,
	i: number,
	sessionId: string,
): Promise<IDataObject | IDataObject[]> {
	const operation = ctx.getNodeParameter('operation', i) as string;
	const base = `/api/sessions/${encodeURIComponent(sessionId)}/channels`;
	const request = (
		method: IHttpRequestMethods,
		path: string,
		body?: IDataObject,
		qs?: IDataObject,
	) =>
		openWaApiRequest.call(ctx, method, `${base}${path}`, {
			body,
			qs,
			sessionId,
			itemIndex: i,
		}) as Promise<IDataObject | IDataObject[]>;
	const fail = (message: string) =>
		new NodeOperationError(ctx.getNode(), message, { itemIndex: i });

	switch (operation) {
		case 'getAll': {
			const channels = (await request('GET', '')) as IDataObject[];
			if (ctx.getNodeParameter('returnAll', i) as boolean) return channels;
			return channels.slice(0, ctx.getNodeParameter('limit', i) as number);
		}
		case 'create': {
			const name = String(ctx.getNodeParameter('channelName', i) ?? '').trim();
			if (!name) throw fail('Name is required');
			if (name.length > 100) throw fail('Name must be at most 100 characters');
			const description = String(ctx.getNodeParameter('channelDescription', i, '') ?? '').trim();
			return await request('POST', '', description ? { name, description } : { name });
		}
		case 'subscribe': {
			const inviteCode = parseChannelInviteCode(ctx.getNodeParameter('channelInviteCode', i));
			return await request('POST', '/subscribe', { inviteCode });
		}
	}

	// The rest act on one channel and, apart from Get and Get Messages, answer `{ success: true }`.
	const channelId = getChannelId(ctx, i);
	const path = `/${encodeURIComponent(channelId)}`;
	const ack = async (subPath: string, body?: IDataObject) => ({
		...((await request('POST', `${path}${subPath}`, body)) as IDataObject),
		channelId,
	});

	switch (operation) {
		case 'get':
			return await request('GET', path);
		case 'getMessages':
			return await request('GET', `${path}/messages`, undefined, {
				limit: ctx.getNodeParameter('limit', i, 50) as number,
			});
		case 'unsubscribe':
			return { ...((await request('DELETE', path)) as IDataObject), channelId };
		case 'delete':
			return await ack('/delete');
		case 'mute':
		case 'unmute':
			return await ack('/mute', { mute: operation === 'mute' });
		case 'demoteAdmin':
			return await ack('/admins/demote', {
				userId: normalizeContactId(ctx.getNodeParameter('channelUserId', i)),
			});
		case 'transferOwnership':
			return await ack('/owner/transfer', {
				newOwnerId: normalizeContactId(ctx.getNodeParameter('channelNewOwnerId', i)),
			});
		default:
			throw fail(`Unsupported operation "${operation}"`);
	}
}

/** The selected channel's ID (`<id>@newsletter`). */
function getChannelId(ctx: IExecuteFunctions, i: number): string {
	const id = String(ctx.getNodeParameter('channel', i, '', { extractValue: true }) ?? '').trim();
	if (!id) throw new NodeOperationError(ctx.getNode(), 'Channel is required', { itemIndex: i });
	return validateChannelId(id);
}
