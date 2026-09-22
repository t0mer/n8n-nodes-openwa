import {
	NodeApiError,
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type IHttpRequestMethods,
	type JsonObject,
} from 'n8n-workflow';
import { parseContactList, parseInviteCode, validateGroupId } from '../helpers/chatId';
import { buildMediaBody, type MediaInput } from '../helpers/media';
import { fetchPaged } from '../helpers/pagination';
import { openWaApiRequest } from '../transport/request';

/** Group operations that are a single call with no body: method and path under the group. */
const SIMPLE_OPERATIONS: Record<string, { method: IHttpRequestMethods; path: string }> = {
	get: { method: 'GET', path: '' },
	leave: { method: 'POST', path: '/leave' },
	removePicture: { method: 'DELETE', path: '/picture' },
	getPicture: { method: 'GET', path: '/picture' },
	getSettings: { method: 'GET', path: '/settings' },
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
			if (fields.name === undefined && fields.description === undefined) {
				throw new NodeOperationError(ctx.getNode(), 'Add a Name or a Description to update', {
					itemIndex: i,
				});
			}
			const name = String(fields.name ?? '').trim();
			if (fields.name !== undefined && !name) {
				throw new NodeOperationError(ctx.getNode(), 'Name cannot be empty', { itemIndex: i });
			}

			const updated: string[] = [];
			if (name) {
				await request('PUT', `${path}/subject`, { body: { subject: name } });
				updated.push('name');
			}
			if (fields.description !== undefined) {
				try {
					await request('PUT', `${path}/description`, {
						body: { description: String(fields.description) },
					});
				} catch (error) {
					// Name and description are two calls; say what already changed so a retry is safe.
					if (updated.length && error instanceof NodeApiError) {
						error.description =
							`The name was already updated; only the description failed. ${error.description ?? ''}`.trim();
					}
					throw new NodeApiError(ctx.getNode(), error as JsonObject, { itemIndex: i });
				}
				updated.push('description');
			}
			return { success: true, groupId: getGroupId(ctx, i), updated };
		}
		case 'approveRequests':
		case 'rejectRequests': {
			const verb = operation === 'approveRequests' ? 'approve' : 'reject';
			// Acting on every pending request must be chosen explicitly: the API does that when the
			// list is omitted, so an empty Requesters value (e.g. a missing expression field) must not.
			const all = ctx.getNodeParameter('requestTarget', i, 'specific') === 'all';
			return await request('POST', `${groupPath()}/membership-requests/${verb}`, {
				body: all
					? {}
					: { participants: getParticipants(ctx, i, { field: 'requesters', label: 'requester' }) },
			});
		}
		case 'getJoinInfo':
			return await request('GET', '/join-info', { qs: { code: getInviteCode(ctx, i) } });
		case 'join':
			return await request('POST', '/join', { body: { inviteCode: getInviteCode(ctx, i) } });
		case 'updateSettings': {
			const settings = ctx.getNodeParameter('groupSettings', i, {}) as IDataObject;
			const body: IDataObject = {};
			for (const key of ['announce', 'locked', 'ephemeralSeconds', 'memberAddMode']) {
				if (settings[key] !== undefined) body[key] = settings[key];
			}
			if (Object.keys(body).length === 0) {
				throw new NodeOperationError(ctx.getNode(), 'Add at least one setting to update', {
					itemIndex: i,
				});
			}
			return await request('PUT', `${groupPath()}/settings`, { body });
		}
		case 'setPicture':
			return await request('PUT', `${groupPath()}/picture`, { body: await getPicture(ctx, i) });
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

/** A contact-list field as normalized contact IDs; an empty list is an error. */
function getParticipants(
	ctx: IExecuteFunctions,
	i: number,
	{ field = 'participants', label = 'participant' } = {},
): string[] {
	let participants: string[];
	try {
		participants = parseContactList(ctx.getNodeParameter(field, i, ''));
	} catch (error) {
		throw new NodeOperationError(ctx.getNode(), error as Error, { itemIndex: i });
	}
	if (participants.length === 0) {
		throw new NodeOperationError(ctx.getNode(), `Add at least one ${label}`, { itemIndex: i });
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

/** The image for Set Picture: `{ url }` or `{ base64, mimetype }`. */
async function getPicture(ctx: IExecuteFunctions, i: number): Promise<IDataObject> {
	let input: MediaInput;
	if (ctx.getNodeParameter('pictureSource', i) === 'binary') {
		const field = ctx.getNodeParameter('pictureBinaryField', i) as string;
		const binary = ctx.helpers.assertBinaryData(i, field);
		const data = await ctx.helpers.getBinaryDataBuffer(i, field);
		input = { source: 'binary', data, mimeType: binary.mimeType };
	} else {
		input = { source: 'url', url: String(ctx.getNodeParameter('pictureUrl', i) ?? '') };
	}
	try {
		// SetGroupPictureDto has no file name.
		const { url, base64, mimetype } = buildMediaBody(input);
		return url ? { url } : { base64, mimetype };
	} catch (error) {
		throw new NodeOperationError(ctx.getNode(), error as Error, { itemIndex: i });
	}
}
