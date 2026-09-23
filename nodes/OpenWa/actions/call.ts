import { NodeOperationError, type IDataObject, type IExecuteFunctions } from 'n8n-workflow';
import { openWaApiRequest } from '../transport/request';

/** Run one Call operation for item `i`. */
export async function executeCall(
	ctx: IExecuteFunctions,
	i: number,
	sessionId: string,
): Promise<IDataObject> {
	const operation = ctx.getNodeParameter('operation', i) as string;
	const request = (path: string, body?: IDataObject) =>
		openWaApiRequest.call(
			ctx,
			'POST',
			`/api/sessions/${encodeURIComponent(sessionId)}/calls${path}`,
			{
				body,
				sessionId,
				itemIndex: i,
			},
		) as Promise<IDataObject>;

	switch (operation) {
		case 'reject': {
			const callId = String(ctx.getNodeParameter('callId', i) ?? '').trim();
			if (!callId)
				throw new NodeOperationError(ctx.getNode(), 'Call ID is required', { itemIndex: i });
			return await request(`/${encodeURIComponent(callId)}/reject`);
		}
		case 'createLink':
			return await request('/link', {
				type: ctx.getNodeParameter('callType', i, 'audio') as string,
				startTime: getStartTime(ctx, i),
			});
		default:
			throw new NodeOperationError(ctx.getNode(), `Unsupported operation "${operation}"`, {
				itemIndex: i,
			});
	}
}

/** The scheduled start as epoch milliseconds; empty means now. */
function getStartTime(ctx: IExecuteFunctions, i: number): number {
	const value = String(ctx.getNodeParameter('startTime', i, '') ?? '').trim();
	if (!value) return Date.now();
	const time = new Date(value).getTime();
	if (!Number.isFinite(time)) {
		throw new NodeOperationError(ctx.getNode(), `Start Time is not a valid date: "${value}"`, {
			itemIndex: i,
		});
	}
	return time;
}
