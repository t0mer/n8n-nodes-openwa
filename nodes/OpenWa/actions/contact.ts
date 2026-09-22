import { NodeOperationError, type IDataObject, type IExecuteFunctions } from 'n8n-workflow';
import { chatIdUser, normalizeContactId } from '../helpers/chatId';
import { fetchPaged } from '../helpers/pagination';
import { openWaApiRequest } from '../transport/request';

/** Run one Contact operation for item `i`. Get Many returns one object per contact. */
export async function executeContact(
	ctx: IExecuteFunctions,
	i: number,
	sessionId: string,
): Promise<IDataObject | IDataObject[]> {
	const operation = ctx.getNodeParameter('operation', i) as string;
	const base = `/api/sessions/${encodeURIComponent(sessionId)}/contacts`;
	const request = (method: 'GET' | 'POST' | 'DELETE', path: string, qs?: IDataObject) =>
		openWaApiRequest.call(ctx, method, `${base}${path}`, {
			qs,
			sessionId,
			itemIndex: i,
		}) as Promise<IDataObject | IDataObject[]>;

	switch (operation) {
		case 'getAll': {
			const returnAll = ctx.getNodeParameter('returnAll', i) as boolean;
			const max = returnAll ? undefined : (ctx.getNodeParameter('limit', i) as number);
			return await fetchPaged(
				async (limit, offset) => (await request('GET', '', { limit, offset })) as IDataObject[],
				max,
			);
		}
		case 'checkNumber': {
			let chatId: string;
			try {
				chatId = normalizeContactId(ctx.getNodeParameter('number', i));
			} catch (error) {
				throw new NodeOperationError(ctx.getNode(), error as Error, { itemIndex: i });
			}
			return (await checkNumber(ctx, i, sessionId, chatId)) as unknown as IDataObject;
		}
		case 'get':
			return await request('GET', `/${encodeURIComponent(getContactId(ctx, i))}`);
		case 'getProfilePicture':
			return await request('GET', `/${encodeURIComponent(getContactId(ctx, i))}/profile-picture`);
		case 'block':
			return await request('POST', `/${encodeURIComponent(getContactId(ctx, i))}/block`);
		case 'unblock':
			return await request('DELETE', `/${encodeURIComponent(getContactId(ctx, i))}/block`);
		case 'getPhone':
			return await request('GET', `/${encodeURIComponent(getContactId(ctx, i))}/phone`);
		default:
			throw new NodeOperationError(ctx.getNode(), `Unsupported operation "${operation}"`, {
				itemIndex: i,
			});
	}
}

/** The selected contact as a normalized chat ID (phone numbers get @c.us appended). */
function getContactId(ctx: IExecuteFunctions, i: number): string {
	const value = String(ctx.getNodeParameter('contact', i, '', { extractValue: true }) ?? '').trim();
	if (!value) {
		throw new NodeOperationError(ctx.getNode(), 'Contact is required', { itemIndex: i });
	}
	if (value.endsWith('@g.us')) {
		throw new NodeOperationError(ctx.getNode(), `"${value}" is a group ID, not a contact`, {
			itemIndex: i,
		});
	}
	try {
		return normalizeContactId(value);
	} catch (error) {
		throw new NodeOperationError(ctx.getNode(), error as Error, { itemIndex: i });
	}
}

export interface NumberCheck {
	number: string;
	exists: boolean;
	whatsappId: string;
}

const LID_NOT_CHECKABLE = {
	message: 'Checking a number needs a phone number, not an @lid ID',
	description: 'Enter the phone number in international format instead.',
};

/** Ask OpenWA whether a phone number is registered on WhatsApp. `@lid` IDs cannot be checked. */
export async function checkNumber(
	ctx: IExecuteFunctions,
	i: number,
	sessionId: string,
	chatId: string,
	lidError: { message: string; description: string } = LID_NOT_CHECKABLE,
): Promise<NumberCheck> {
	if (chatId.endsWith('@lid')) {
		throw new NodeOperationError(ctx.getNode(), lidError.message, {
			itemIndex: i,
			description: lidError.description,
		});
	}
	const number = chatIdUser(chatId);
	return (await openWaApiRequest.call(
		ctx,
		'GET',
		`/api/sessions/${encodeURIComponent(sessionId)}/contacts/check/${encodeURIComponent(number)}`,
		{ sessionId, itemIndex: i },
	)) as NumberCheck;
}
