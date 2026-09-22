import { NodeOperationError, type IDataObject, type IExecuteFunctions } from 'n8n-workflow';
import { normalizeContactId } from '../helpers/chatId';
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
		case 'get':
			return await request('GET', `/${encodeURIComponent(getContactId(ctx, i))}`);
		default:
			throw new NodeOperationError(ctx.getNode(), `Unsupported operation "${operation}"`, {
				itemIndex: i,
			});
	}
}

/** The selected contact as a normalized chat ID (phone numbers get @c.us appended). */
function getContactId(ctx: IExecuteFunctions, i: number): string {
	try {
		return normalizeContactId(ctx.getNodeParameter('contact', i, '', { extractValue: true }));
	} catch (error) {
		throw new NodeOperationError(ctx.getNode(), error as Error, { itemIndex: i });
	}
}
