import { NodeOperationError, type IDataObject, type IExecuteFunctions } from 'n8n-workflow';
import { normalizeContactId } from '../helpers/chatId';
import { openWaApiRequest } from '../transport/request';

/** Run one Status (Stories) operation for item `i`. List operations return one object per status. */
export async function executeStatus(
	ctx: IExecuteFunctions,
	i: number,
	sessionId: string,
): Promise<IDataObject | IDataObject[]> {
	const operation = ctx.getNodeParameter('operation', i) as string;
	const request = (method: 'GET' | 'POST' | 'DELETE', path: string, body?: IDataObject) =>
		openWaApiRequest.call(
			ctx,
			method,
			`/api/sessions/${encodeURIComponent(sessionId)}/status${path}`,
			{
				body,
				sessionId,
				itemIndex: i,
			},
		) as Promise<IDataObject>;
	const list = async (path: string) =>
		((await request('GET', path)) as { statuses?: IDataObject[] }).statuses ?? [];

	switch (operation) {
		case 'getAll':
			return await list('');
		case 'getFromContact': {
			let contactId: string;
			try {
				contactId = normalizeContactId(ctx.getNodeParameter('statusContact', i));
			} catch (error) {
				throw new NodeOperationError(ctx.getNode(), error as Error, { itemIndex: i });
			}
			return await list(`/${encodeURIComponent(contactId)}`);
		}
		default:
			throw new NodeOperationError(ctx.getNode(), `Unsupported operation "${operation}"`, {
				itemIndex: i,
			});
	}
}
