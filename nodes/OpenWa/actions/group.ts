import {
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type IHttpRequestMethods,
} from 'n8n-workflow';
import { parseContactList, parseInviteCode, validateGroupId } from '../helpers/chatId';
import { fetchPaged } from '../helpers/pagination';
import { openWaApiRequest } from '../transport/request';

/** Group operations that are a single call with no body: method and path under the group. */
const SIMPLE_OPERATIONS: Record<string, { method: IHttpRequestMethods; path: string }> = {
	get: { method: 'GET', path: '' },
	revokeInviteLink: { method: 'POST', path: '/invite-code/revoke' },
	getInviteLink: { method: 'GET', path: '/invite-code' },
	getMembershipRequests: { method: 'GET', path: '/membership-requests' },
};

/** Operations that post a participants list: method and path under the group. */
const PARTICIPANT_ACTIONS: Record<string, { method: IHttpRequestMethods; path: string }> = {
	addParticipants: { method: 'POST', path: '/participants' },
	removeParticipants: { method: 'DELETE', path: '/participants' },
	promoteParticipants: { method: 'POST', path: '/participants/promote' },
	demoteParticipants: { method: 'POST', path: '/participants/demote' },
};

/** Run one Group operation for item `i`. List operations return one object per entry. */
export async function executeGroup(
	ctx: IExecuteFunctions,
	i: number,
	sessionId: string,
): Promise<IDataObject | IDataObject[]> {
	const operation = ctx.getNodeParameter('operation', i) as string;
	const base = `/api/sessions/${encodeURIComponent(sessionId)}/groups`;
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
	const groupPath = () => `/${encodeURIComponent(getGroupId(ctx, i))}`;

	const simple = SIMPLE_OPERATIONS[operation];
	if (simple) return await request(simple.method, `${groupPath()}${simple.path}`);

	const action = PARTICIPANT_ACTIONS[operation];
	if (action) {
		return await request(action.method, `${groupPath()}${action.path}`, {
			body: { participants: getParticipants(ctx, i) },
		});
	}

	switch (operation) {
		case 'getAll': {
			const returnAll = ctx.getNodeParameter('returnAll', i) as boolean;
			const max = returnAll ? undefined : (ctx.getNodeParameter('limit', i) as number);
			return await fetchPaged(
				async (limit, offset) =>
					(await request('GET', '', { qs: { limit, offset } })) as IDataObject[],
				max,
			);
		}
		case 'getParticipants': {
			const group = (await request('GET', groupPath())) as { participants?: IDataObject[] };
			return group.participants ?? [];
		}
		case 'create': {
			const name = String(ctx.getNodeParameter('groupName', i) ?? '').trim();
			if (!name) {
				throw new NodeOperationError(ctx.getNode(), 'Group Name is required', { itemIndex: i });
			}
			return await request('POST', '', { body: { name, participants: getParticipants(ctx, i) } });
		}
		case 'update': {
			const path = groupPath();
			const fields = ctx.getNodeParameter('groupUpdateFields', i, {}) as IDataObject;
			const name = String(fields.name ?? '').trim();
			const updated: string[] = [];
			if (name) {
				await request('PUT', `${path}/subject`, { body: { subject: name } });
				updated.push('name');
			}
			if (fields.description !== undefined) {
				await request('PUT', `${path}/description`, {
					body: { description: String(fields.description) },
				});
				updated.push('description');
			}
			if (updated.length === 0) {
				throw new NodeOperationError(ctx.getNode(), 'Add a Name or a Description to update', {
					itemIndex: i,
				});
			}
			return { success: true, groupId: getGroupId(ctx, i), updated };
		}
		case 'approveRequests':
		case 'rejectRequests': {
			const requesters = getParticipants(ctx, i, { field: 'requesters', optional: true });
			const verb = operation === 'approveRequests' ? 'approve' : 'reject';
			// No requesters means every pending request, which the API expresses by omitting the list.
			return await request('POST', `${groupPath()}/membership-requests/${verb}`, {
				body: requesters.length ? { participants: requesters } : {},
			});
		}
		case 'getJoinInfo':
			return await request('GET', '/join-info', { qs: { code: getInviteCode(ctx, i) } });
		case 'join':
			return await request('POST', '/join', { body: { inviteCode: getInviteCode(ctx, i) } });
		default:
			throw new NodeOperationError(ctx.getNode(), `Unsupported operation "${operation}"`, {
				itemIndex: i,
			});
	}
}

function getGroupId(ctx: IExecuteFunctions, i: number): string {
	try {
		return validateGroupId(ctx.getNodeParameter('group', i, '', { extractValue: true }));
	} catch (error) {
		throw new NodeOperationError(ctx.getNode(), error as Error, { itemIndex: i });
	}
}

/** A contact-list field as normalized contact IDs; empty is an error unless `optional`. */
function getParticipants(
	ctx: IExecuteFunctions,
	i: number,
	{ field = 'participants', optional = false } = {},
): string[] {
	let participants: string[];
	try {
		participants = parseContactList(ctx.getNodeParameter(field, i, ''));
	} catch (error) {
		throw new NodeOperationError(ctx.getNode(), error as Error, { itemIndex: i });
	}
	if (!optional && participants.length === 0) {
		throw new NodeOperationError(ctx.getNode(), 'Add at least one participant', { itemIndex: i });
	}
	return participants;
}

function getInviteCode(ctx: IExecuteFunctions, i: number): string {
	try {
		return parseInviteCode(ctx.getNodeParameter('inviteCode', i));
	} catch (error) {
		throw new NodeOperationError(ctx.getNode(), error as Error, { itemIndex: i });
	}
}
