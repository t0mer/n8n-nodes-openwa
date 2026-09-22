import { NodeApiError, type IExecuteFunctions } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import { OpenWa } from '../nodes/OpenWa/OpenWa.node';
import { fakeContext } from './fakeContext';

const node = new OpenWa();
const run = (ctx: IExecuteFunctions) => node.execute.call(ctx);
const session = { mode: 'id', value: 's1' };
const recipient = { recipientType: 'contact', phoneNumber: '972501234567' };

/** What n8n-core throws for a failed raw request: the axios response is kept as `cause`. */
function rawHttpError(status: number, body: object) {
	return Object.assign(new Error(`Request failed with status code ${status}`), {
		httpCode: String(status),
		cause: { response: { status, data: Buffer.from(JSON.stringify(body)) } },
	});
}

describe('OpenWa.execute', () => {
	it('passes binary items through with pairedItem', async () => {
		const { ctx } = fakeContext(
			{ resource: 'message', operation: 'downloadMedia', session, ...recipient, messageId: 'm1' },
			{ body: Buffer.from('x'), headers: { 'content-type': 'image/png' }, statusCode: 200 },
			{ items: 2 },
		);
		const [output] = await run(ctx);
		expect(output).toHaveLength(2);
		expect(output.map((item) => item.pairedItem)).toEqual([{ item: 0 }, { item: 1 }]);
		expect(output[0].binary?.data).toMatchObject({ mimeType: 'image/png' });
		expect(output[0].json).toMatchObject({ messageId: 'm1', fileSize: 1 });
	});

	it('keeps a plain response that has a json key as JSON, not as a binary item', async () => {
		const response = { json: { a: 1 }, messageId: 'x' };
		const { ctx } = fakeContext(
			{ resource: 'message', operation: 'sendText', session, ...recipient, text: 'hi' },
			response,
		);
		const [output] = await run(ctx);
		expect(output).toEqual([{ json: response, pairedItem: { item: 0 } }]);
	});

	it('fans out array results, one item per element', async () => {
		const { ctx } = fakeContext(
			{ resource: 'template', operation: 'getAll', session, returnAll: true },
			[{ id: 'a' }, { id: 'b' }],
		);
		const [output] = await run(ctx);
		expect(output).toEqual([
			{ json: { id: 'a' }, pairedItem: { item: 0 } },
			{ json: { id: 'b' }, pairedItem: { item: 0 } },
		]);
	});

	it('routes the profile and status resources, including a status binary item', async () => {
		const { ctx: profile, calls } = fakeContext(
			{ resource: 'profile', operation: 'setAbout', session, profileAbout: 'Hi' },
			{ success: true, message: 'ok' },
		);
		expect(await run(profile)).toEqual([
			[{ json: { success: true, message: 'ok' }, pairedItem: { item: 0 } }],
		]);
		expect(calls[0].url).toBe('https://wa.example.com/api/sessions/s1/profile/status');

		const { ctx: status } = fakeContext(
			{ resource: 'status', operation: 'downloadMedia', session, statusId: 'st1' },
			{ body: Buffer.from('x'), headers: { 'content-type': 'image/png' }, statusCode: 200 },
		);
		const [output] = await run(status);
		expect(output[0]).toMatchObject({ json: { statusId: 'st1' }, pairedItem: { item: 0 } });
		expect(output[0].binary?.data).toMatchObject({ mimeType: 'image/png' });
	});

	it('maps an error whose body arrived as bytes on a raw request', async () => {
		const { ctx } = fakeContext(
			{ resource: 'message', operation: 'downloadMedia', session, ...recipient, messageId: 'm1' },
			() => rawHttpError(404, { message: 'Media not found', statusCode: 404 }),
		);
		const error = await run(ctx).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(NodeApiError);
		expect((error as NodeApiError).message).toBe('Media not found');
		expect((error as NodeApiError).httpCode).toBe('404');
	});

	it('outputs an error item per failed input with continueOnFail', async () => {
		const { ctx } = fakeContext(
			{ resource: 'message', operation: 'sendText', session, ...recipient, text: 'hi' },
			() => rawHttpError(401, { message: 'Invalid API key' }),
			{ items: 2, continueOnFail: true },
		);
		const [output] = await run(ctx);
		expect(output).toEqual([
			{
				json: { error: expect.stringMatching(/check your OpenWA API key/) },
				pairedItem: { item: 0 },
			},
			{
				json: { error: expect.stringMatching(/check your OpenWA API key/) },
				pairedItem: { item: 1 },
			},
		]);
	});
});
