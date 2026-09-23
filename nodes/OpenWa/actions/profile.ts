import { NodeOperationError, type IDataObject, type IExecuteFunctions } from 'n8n-workflow';
import { openWaApiRequest } from '../transport/request';
import { readMediaInput } from './media';

/** WhatsApp's limits, checked locally for a clear error. */
const MAX_NAME_LENGTH = 25;
const MAX_ABOUT_LENGTH = 139;

/** Run one Profile operation (on the session's own account) for item `i`. */
export async function executeProfile(
	ctx: IExecuteFunctions,
	i: number,
	sessionId: string,
): Promise<IDataObject> {
	const operation = ctx.getNodeParameter('operation', i) as string;
	const request = (method: 'PUT' | 'DELETE', path: string, body?: IDataObject) =>
		openWaApiRequest.call(
			ctx,
			method,
			`/api/sessions/${encodeURIComponent(sessionId)}/profile${path}`,
			{
				body,
				sessionId,
				itemIndex: i,
			},
		) as Promise<IDataObject>;

	switch (operation) {
		case 'setName': {
			const name = String(ctx.getNodeParameter('profileName', i) ?? '').trim();
			if (!name) throw new NodeOperationError(ctx.getNode(), 'Name is required', { itemIndex: i });
			assertMaxLength(ctx, i, 'Name', name, MAX_NAME_LENGTH);
			return await request('PUT', '/name', { name });
		}
		case 'setAbout': {
			const status = String(ctx.getNodeParameter('profileAbout', i, '') ?? '');
			assertMaxLength(ctx, i, 'About', status, MAX_ABOUT_LENGTH);
			return await request('PUT', '/status', { status });
		}
		case 'setPicture':
			return await request(
				'PUT',
				'/picture',
				await readMediaInput(
					ctx,
					i,
					{
						source: 'profilePictureSource',
						url: 'profilePictureUrl',
						binary: 'profilePictureBinaryField',
						base64: 'profilePictureBase64',
						mimeType: 'profilePictureMimeType',
					},
					{ accept: 'image', label: 'The profile picture' },
				),
			);
		case 'removePicture':
			return await request('DELETE', '/picture');
		case 'setPresence':
			return (await openWaApiRequest.call(
				ctx,
				'PUT',
				`/api/sessions/${encodeURIComponent(sessionId)}/presence`,
				{
					body: { available: ctx.getNodeParameter('online', i, true) as boolean },
					sessionId,
					itemIndex: i,
				},
			)) as IDataObject;
		default:
			throw new NodeOperationError(ctx.getNode(), `Unsupported operation "${operation}"`, {
				itemIndex: i,
			});
	}
}

/** Counts characters (code points), so an emoji counts as one. */
function assertMaxLength(
	ctx: IExecuteFunctions,
	i: number,
	label: string,
	value: string,
	max: number,
): void {
	const length = [...value].length;
	if (length > max) {
		throw new NodeOperationError(
			ctx.getNode(),
			`${label} is ${length} characters; WhatsApp allows at most ${max}`,
			{ itemIndex: i },
		);
	}
}
