import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import { OpenWa } from '../nodes/OpenWa/OpenWa.node';
import { bulkFields } from '../nodes/OpenWa/descriptions/bulk';
import { fakeContext } from './fakeContext';

const node = new OpenWa();
const run = (ctx: IExecuteFunctions) => node.execute.call(ctx);
const session = { mode: 'id', value: 's1' };
const base = { resource: 'message', operation: 'sendBulk', session, recipientType: 'contact' };

/** Make `name` resolve per item: `values(i)` for item i, the shared params otherwise. */
function perItem(ctx: IExecuteFunctions, name: string, values: (i: number) => unknown) {
	const original = ctx.getNodeParameter.bind(ctx) as (...args: unknown[]) => unknown;
	(ctx as unknown as { getNodeParameter: unknown }).getNodeParameter = (
		param: string,
		i: number,
		...rest: unknown[]
	) => (param === name ? values(i) : original(param, i, ...rest));
}

const accepted = { batchId: 'b', status: 'processing', totalMessages: 1, statusUrl: '/x' };

describe('Message → Send Bulk', () => {
	it('splits 150 items into batches of 100 and 50, each paired with its items', async () => {
		const { ctx, calls } = fakeContext({ ...base, bulkType: 'text', text: 'Hi' }, accepted, {
			items: 150,
		});
		perItem(ctx, 'phoneNumber', (i) => `97250${String(i).padStart(7, '0')}`);
		const [output] = await run(ctx);

		expect(calls).toHaveLength(2);
		expect(calls[0]).toMatchObject({
			method: 'POST',
			url: 'https://wa.example.com/api/sessions/s1/messages/send-bulk',
		});
		const bodies = calls.map((call) => call.body as IDataObject);
		expect((bodies[0].messages as IDataObject[]).length).toBe(100);
		expect((bodies[1].messages as IDataObject[]).length).toBe(50);
		expect((bodies[1].messages as IDataObject[])[0]).toEqual({
			chatId: '972500000100@c.us',
			type: 'text',
			content: { text: 'Hi' },
		});
		expect(bodies[0].options).toEqual({
			delayBetweenMessages: 3000,
			randomizeDelay: true,
			stopOnError: false,
		});
		expect(bodies[0]).not.toHaveProperty('batchId');

		expect(output).toHaveLength(2);
		expect(output[0].json).toEqual(accepted);
		expect(output[0].pairedItem).toEqual(Array.from({ length: 100 }, (_, item) => ({ item })));
		expect(output[1].pairedItem).toEqual(Array.from({ length: 50 }, (_, n) => ({ item: 100 + n })));
	});

	it('suffixes a custom Batch ID only when there is more than one batch', async () => {
		const options = { batchId: 'news', delayBetweenMessages: 5000, stopOnError: true };
		const { ctx, calls } = fakeContext(
			{ ...base, phoneNumber: '972501234567', bulkType: 'text', text: 'Hi', options },
			accepted,
			{ items: 101 },
		);
		perItem(ctx, 'text', (i) => `Hi ${i}`);
		await run(ctx);
		expect(calls.map((call) => (call.body as IDataObject).batchId)).toEqual(['news-1', 'news-2']);
		expect((calls[0].body as IDataObject).options).toEqual({
			delayBetweenMessages: 5000,
			randomizeDelay: true,
			stopOnError: true,
		});

		const single = fakeContext(
			{ ...base, phoneNumber: '972501234567', bulkType: 'text', text: 'Hi', options },
			accepted,
			{ items: 2 },
		);
		await run(single.ctx);
		expect((single.calls[0].body as IDataObject).batchId).toBe('news');
	});

	it('builds the content of each media type', async () => {
		const cases: Array<[IDataObject, IDataObject]> = [
			[
				{
					bulkType: 'image',
					mediaSource: 'url',
					mediaUrl: 'https://example.com/a.jpg',
					caption: 'Look @972509876543',
					options: { mentions: '972509876543' },
				},
				{
					image: { url: 'https://example.com/a.jpg' },
					caption: 'Look @972509876543',
					mentions: ['972509876543@c.us'],
				},
			],
			[
				{ bulkType: 'video', mediaSource: 'base64', mediaBase64: 'data:video/mp4;base64,AAAA' },
				{ video: { base64: 'AAAA', mimetype: 'video/mp4' } },
			],
			[
				{ bulkType: 'audio', mediaSource: 'binary', binaryPropertyName: 'data', ptt: true },
				{
					audio: {
						base64: Buffer.from('mp3-bytes').toString('base64'),
						mimetype: 'audio/mpeg',
						ptt: true,
					},
				},
			],
			[
				{
					bulkType: 'document',
					mediaSource: 'binary',
					binaryPropertyName: 'data',
					binaryMeta: { mimeType: 'application/pdf', fileName: 'a.pdf' },
					fileName: 'invoice.pdf',
					caption: 'Invoice',
				},
				{
					document: {
						base64: Buffer.from('mp3-bytes').toString('base64'),
						mimetype: 'application/pdf',
						filename: 'invoice.pdf',
					},
					caption: 'Invoice',
				},
			],
		];
		for (const [params, content] of cases) {
			const { ctx, calls } = fakeContext(
				{ ...base, phoneNumber: '972501234567', ...params },
				accepted,
			);
			await run(ctx);
			expect((calls[0].body as IDataObject).messages).toEqual([
				{ chatId: '972501234567@c.us', type: params.bulkType, content },
			]);
		}
	});

	it('sends a group recipient and drops the binary file name for non-documents', async () => {
		const { ctx, calls } = fakeContext(
			{
				...base,
				recipientType: 'group',
				group: { mode: 'id', value: '120363012345678901@g.us' },
				bulkType: 'image',
				mediaSource: 'binary',
				binaryPropertyName: 'data',
				binaryMeta: { mimeType: 'image/png', fileName: 'a.png' },
			},
			accepted,
		);
		await run(ctx);
		const [message] = (calls[0].body as IDataObject).messages as IDataObject[];
		expect(message.chatId).toBe('120363012345678901@g.us');
		expect((message.content as IDataObject).image).not.toHaveProperty('filename');
	});

	it('skips a bad item with an error item under continueOnFail, and throws without it', async () => {
		const params = { ...base, bulkType: 'text', text: 'Hi' };
		const phone = (i: number) => (i === 1 ? 'not a number' : '972501234567');

		const { ctx, calls } = fakeContext(params, accepted, { items: 3, continueOnFail: true });
		perItem(ctx, 'phoneNumber', phone);
		const [output] = await run(ctx);
		expect(output).toEqual([
			{ json: { error: expect.any(String) }, pairedItem: { item: 1 } },
			{ json: accepted, pairedItem: [{ item: 0 }, { item: 2 }] },
		]);
		expect((calls[0].body as IDataObject).messages).toHaveLength(2);

		const failing = fakeContext(params, accepted, { items: 3 });
		perItem(failing.ctx, 'phoneNumber', phone);
		const error = (await run(failing.ctx).catch((e: unknown) => e)) as { context?: IDataObject };
		expect(error).toBeInstanceOf(Error);
		expect(error.context?.itemIndex).toBe(1);
		expect(failing.calls).toHaveLength(0);
	});

	it('rejects text and captions over the length limits', async () => {
		const { ctx } = fakeContext({
			...base,
			phoneNumber: '972501234567',
			bulkType: 'text',
			text: 'x'.repeat(4097),
		});
		await expect(run(ctx)).rejects.toThrow(
			'Text is 4097 characters, above the 4096-character limit',
		);

		const { ctx: caption } = fakeContext({
			...base,
			phoneNumber: '972501234567',
			bulkType: 'image',
			mediaSource: 'url',
			mediaUrl: 'https://example.com/a.jpg',
			caption: 'x'.repeat(1025),
		});
		await expect(run(caption)).rejects.toThrow('Caption is 1025 characters');
	});

	it('rejects an out-of-range delay', async () => {
		const { ctx, calls } = fakeContext({
			...base,
			phoneNumber: '972501234567',
			bulkType: 'text',
			text: 'Hi',
			options: { delayBetweenMessages: 500 },
		});
		await expect(run(ctx)).rejects.toThrow(/from 1000 to 60000, got 500/);
		expect(calls).toHaveLength(0);
	});

	it('refuses a batch above the 25 MB request limit, suggesting URLs', async () => {
		const params = {
			...base,
			phoneNumber: '972501234567',
			bulkType: 'document',
			mediaSource: 'binary',
			binaryPropertyName: 'data',
			binaryData: Buffer.alloc(10 * 1024 * 1024),
		};
		// Three 10 MB files are ~40 MB once base64-encoded.
		const { ctx, calls } = fakeContext(params, accepted, { items: 3 });
		perItem(ctx, 'fileName', (i) => `f${i}.bin`);
		await expect(run(ctx)).rejects.toThrow(/above OpenWA's 25\.0 MB request limit/);
		expect(calls).toHaveLength(0);

		const cof = fakeContext(params, accepted, { items: 3, continueOnFail: true });
		perItem(cof.ctx, 'fileName', (i) => `f${i}.bin`);
		const [output] = await run(cof.ctx);
		expect(output).toEqual([
			{
				json: { error: expect.stringMatching(/request limit/) },
				pairedItem: [{ item: 0 }, { item: 1 }, { item: 2 }],
			},
		]);
	});

	it('batches items per session', async () => {
		const { ctx, calls } = fakeContext(
			{ ...base, phoneNumber: '972501234567', bulkType: 'text', text: 'Hi' },
			accepted,
			{ items: 3 },
		);
		perItem(ctx, 'session', (i) => (i === 1 ? 's2' : 's1'));
		const [output] = await run(ctx);
		expect(calls.map((call) => call.url)).toEqual([
			'https://wa.example.com/api/sessions/s1/messages/send-bulk',
			'https://wa.example.com/api/sessions/s2/messages/send-bulk',
		]);
		expect(output.map((item) => item.pairedItem)).toEqual([
			[{ item: 0 }, { item: 2 }],
			[{ item: 1 }],
		]);
	});

	it('shows the reused fields only for the matching bulk types', () => {
		const types = (name: string) =>
			bulkFields
				.filter((field) => field.name === name)
				.flatMap((field) => field.displayOptions?.show?.bulkType ?? []);
		expect(types('text')).toEqual(['text']);
		expect(types('caption')).toEqual(['image', 'video', 'document']);
		expect(types('ptt')).toEqual(['audio']);
		expect(types('fileName')).toEqual(['document']);
		expect(types('mediaSource')).toEqual(['image', 'video', 'audio', 'document']);
		expect(types('convertToVoiceNote')).toEqual([]);
	});
});

describe('Message → Get Batch Status / Cancel Batch', () => {
	it('GETs the batch status and POSTs the cancel', async () => {
		const status = fakeContext(
			{ resource: 'message', operation: 'getBatchStatus', session, batchId: 'batch/1' },
			{ batchId: 'batch/1', status: 'processing' },
		);
		const [output] = await run(status.ctx);
		expect(status.calls[0]).toMatchObject({
			method: 'GET',
			url: 'https://wa.example.com/api/sessions/s1/messages/batch/batch%2F1',
		});
		expect(output).toEqual([
			{ json: { batchId: 'batch/1', status: 'processing' }, pairedItem: { item: 0 } },
		]);

		const cancel = fakeContext(
			{ resource: 'message', operation: 'cancelBatch', session, batchId: 'b1' },
			{ batchId: 'b1', status: 'cancelled' },
		);
		await run(cancel.ctx);
		expect(cancel.calls[0]).toMatchObject({
			method: 'POST',
			url: 'https://wa.example.com/api/sessions/s1/messages/batch/b1/cancel',
		});
	});

	it('requires a Batch ID', async () => {
		const { ctx } = fakeContext({
			resource: 'message',
			operation: 'getBatchStatus',
			session,
			batchId: ' ',
		});
		await expect(run(ctx)).rejects.toThrow('Batch ID is required');
	});
});
