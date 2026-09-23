import { NodeHelpers, type IExecuteFunctions, type INodeParameters } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import { isSessionless, sessionField, sessionFields } from '../nodes/OpenWa/descriptions/common';
import { OpenWa } from '../nodes/OpenWa/OpenWa.node';
import { fakeContext } from './fakeContext';

const map: Record<string, string[] | '*'> = { system: '*', session: ['getAll', 'create'] };

/** How many Session copies n8n would display for these parameter values. */
const shown = (values: INodeParameters) =>
	sessionFields(map).filter((field) => NodeHelpers.displayParameter(values, field, null)).length;

describe('isSessionless', () => {
	it('matches whole resources and listed operations only', () => {
		expect(isSessionless('system', 'health', map)).toBe(true);
		expect(isSessionless('session', 'getAll', map)).toBe(true);
		expect(isSessionless('session', 'get', map)).toBe(false);
		expect(isSessionless('chat', 'getAll', map)).toBe(false);
	});

	it('has no sessionless operations by default', () => {
		expect(isSessionless('message', 'sendText')).toBe(false);
	});
});

describe('sessionFields', () => {
	it('is the plain Session field when nothing is sessionless', () => {
		expect(sessionFields({})).toEqual([sessionField]);
	});

	it('shows exactly one Session field for operations that need one', () => {
		expect(shown({ resource: 'chat', operation: 'getAll' })).toBe(1);
		expect(shown({ resource: 'session', operation: 'get' })).toBe(1);
	});

	it('hides the Session field for sessionless operations only', () => {
		expect(shown({ resource: 'system', operation: 'health' })).toBe(0);
		expect(shown({ resource: 'session', operation: 'getAll' })).toBe(0);
		expect(shown({ resource: 'session', operation: 'create' })).toBe(0);
	});
});

describe('OpenWa.execute session routing', () => {
	const run = (ctx: IExecuteFunctions) => new OpenWa().execute.call(ctx);

	it('runs a sessionless operation without a session', async () => {
		const { ctx, calls } = fakeContext(
			{ resource: 'session', operation: 'getAll', returnAll: true },
			[{ id: 'a' }],
		);
		expect(await run(ctx)).toEqual([[{ json: { id: 'a' }, pairedItem: { item: 0 } }]]);
		expect(calls).toHaveLength(1);
	});

	it('still requires a session for other operations', async () => {
		const { ctx, calls } = fakeContext({ resource: 'session', operation: 'get' });
		await expect(run(ctx)).rejects.toThrow('Session is required');
		expect(calls).toHaveLength(0);
	});

	it('hides the Session field for the sessionless Session operations', () => {
		expect(isSessionless('session', 'create')).toBe(true);
		expect(isSessionless('session', 'getStats')).toBe(true);
		expect(isSessionless('session', 'start')).toBe(false);
	});
});
