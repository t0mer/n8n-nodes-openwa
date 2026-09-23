import { describe, expect, it } from 'vitest';
import { OpenWa } from '../nodes/OpenWa/OpenWa.node';
import { atLeast } from '../nodes/OpenWa/helpers/version';
import { fakeContext } from './fakeContext';

const node = new OpenWa();
const params = {
	resource: 'message',
	operation: 'sendText',
	session: { mode: 'id', value: 's1' },
	recipientType: 'contact',
	phoneNumber: '972501234567',
	text: 'hi',
};

describe('node versioning', () => {
	it('offers versions 1 and 1.1 and defaults new nodes to 1.1', () => {
		expect(node.description.version).toEqual([1, 1.1]);
		expect(node.description.defaultVersion).toBe(1.1);
	});

	it('atLeast compares against the running node version', () => {
		const v1 = fakeContext({}, {}, { typeVersion: 1 }).ctx;
		const v11 = fakeContext({}, {}, { typeVersion: 1.1 }).ctx;
		expect(atLeast(v1, 1)).toBe(true);
		expect(atLeast(v1, 1.1)).toBe(false);
		expect(atLeast(v11, 1.1)).toBe(true);
	});

	it('produces the same request and output in versions 1 and 1.1', async () => {
		const results = [];
		for (const typeVersion of [1, 1.1]) {
			const { ctx, calls } = fakeContext(params, { id: 'm1' }, { typeVersion });
			results.push({ output: await node.execute.call(ctx), calls });
		}
		expect(results[1]).toEqual(results[0]);
		expect(results[0].output).toEqual([[{ json: { id: 'm1' }, pairedItem: { item: 0 } }]]);
	});
});
