import {
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type IHttpRequestMethods,
} from 'n8n-workflow';
import { validateGroupId } from '../helpers/chatId';
import { fetchPaged } from '../helpers/pagination';
import { openWaApiRequest } from '../transport/request';

/** Group operations that are a single call with no body: method and path under the group. */
const SIMPLE_OPERATIONS: Record<string, { method: IHttpRequestMethods; path: string }> = {
	get: { method: 'GET', path: '' },
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
