import type { ILoadOptionsFunctions } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import { executeAutomationRule } from '../nodes/OpenWa/actions/automationRule';
import { isSessionless } from '../nodes/OpenWa/descriptions/common';
import { searchAutomationRules } from '../nodes/OpenWa/methods/listSearch';
import { OpenWa } from '../nodes/OpenWa/OpenWa.node';
import { fakeContext } from './fakeContext';

const base = 'https://wa.example.com/api/sessions/s1/automation-rules';
const automationRule = { mode: 'id', value: ' rule 1 ' };
const rulePath = `${base}/rule%201`;
const condition = { field: 'body', operator: 'contains', value: 'price' };

async function run(params: Record<string, unknown>, response: unknown = { ok: true }) {
	const { ctx, calls } = fakeContext(params, response);
	const result = await executeAutomationRule(ctx, 0, 's1');
	return { result, calls: calls.map(({ method, url, body }) => ({ method, url, body })) };
}
const one = async (params: Record<string, unknown>) => (await run(params)).calls[0];

describe('automationRule', () => {
	it('create sends the name, reply, conditions and options', async () => {
		expect(
			await one({
				operation: 'create',
				ruleName: ' Prices ',
				replyText: 'See our price list.',
				ruleOptions: {
					ruleConditions: JSON.stringify({ conditions: [condition] }),
					cooldownSeconds: 0,
					enabled: false,
				},
			}),
		).toEqual({
			method: 'POST',
			url: base,
			body: {
				name: 'Prices',
				replyText: 'See our price list.',
				conditions: { conditions: [condition] },
				cooldownSeconds: 0,
				enabled: false,
			},
		});
	});

	it('create leaves out empty conditions so the rule matches every message', async () => {
		const call = await one({
			operation: 'create',
			ruleName: 'Away',
			replyText: 'Back soon',
			ruleOptions: { ruleConditions: '' },
		});
		expect(call.body).toEqual({ name: 'Away', replyText: 'Back soon' });
	});

	it('create accepts a bare array of conditions', async () => {
		const call = await one({
			operation: 'create',
			ruleName: 'Away',
			replyText: 'Back soon',
			ruleOptions: { ruleConditions: [condition] },
		});
		expect(call.body?.conditions).toEqual({ conditions: [condition] });
	});

	it('create validates name, reply text, cooldown and conditions', async () => {
		const create = (extra: Record<string, unknown>) =>
			run({ operation: 'create', ruleName: 'R', replyText: 'Hi', ...extra });
		await expect(create({ ruleName: ' ' })).rejects.toThrow('Name is required');
		await expect(create({ ruleName: 'x'.repeat(101) })).rejects.toThrow('at most 100');
		await expect(create({ replyText: ' ' })).rejects.toThrow('Reply Text is required');
		await expect(create({ replyText: 'x'.repeat(4097) })).rejects.toThrow('at most 4096');
		await expect(create({ ruleOptions: { cooldownSeconds: 86401 } })).rejects.toThrow('0 to 86400');
		await expect(create({ ruleOptions: { cooldownSeconds: 1.5 } })).rejects.toThrow('0 to 86400');
		await expect(create({ ruleOptions: { ruleConditions: '{"conditions": []}' } })).rejects.toThrow(
			'1–20',
		);
		await expect(create({ ruleOptions: { ruleConditions: '{oops' } })).rejects.toThrow(
			'not valid JSON',
		);
	});

	it('get many keeps the evaluation order, up to the limit', async () => {
		const rows = [{ id: 'c' }, { id: 'a' }, { id: 'b' }];
		const { result, calls } = await run({ operation: 'getAll', returnAll: false, limit: 2 }, rows);
		expect(result).toEqual([{ id: 'c' }, { id: 'a' }]);
		expect(calls).toEqual([{ method: 'GET', url: base, body: undefined }]);
		expect((await run({ operation: 'getAll', returnAll: true }, rows)).result).toEqual(rows);
	});

	it('get and delete address the rule by ID', async () => {
		expect(await one({ operation: 'get', automationRule })).toEqual({
			method: 'GET',
			url: rulePath,
			body: undefined,
		});
		const deleted = await run({ operation: 'delete', automationRule }, '');
		expect(deleted.calls[0]).toMatchObject({ method: 'DELETE', url: rulePath });
		expect(deleted.result).toEqual({ success: true, ruleId: 'rule 1' });
		await expect(
			run({ operation: 'get', automationRule: { mode: 'id', value: '' } }),
		).rejects.toThrow('Rule is required');
	});

	it('update sends only the chosen fields', async () => {
		expect(
			await one({
				operation: 'update',
				automationRule,
				ruleUpdateFields: {
					ruleName: 'Renamed',
					replyText: 'New reply',
					cooldownSeconds: 30,
					enabled: true,
					ruleConditions: JSON.stringify([condition]),
				},
			}),
		).toEqual({
			method: 'PUT',
			url: rulePath,
			body: {
				name: 'Renamed',
				replyText: 'New reply',
				cooldownSeconds: 30,
				enabled: true,
				conditions: { conditions: [condition] },
			},
		});
		const disabled = await one({
			operation: 'update',
			automationRule,
			ruleUpdateFields: { enabled: false },
		});
		expect(disabled.body).toEqual({ enabled: false });
	});

	it('update clears the conditions with an empty object', async () => {
		const call = await one({
			operation: 'update',
			automationRule,
			ruleUpdateFields: { clearConditions: true, ruleConditions: '' },
		});
		expect(call.body).toEqual({ conditions: {} });
	});

	it('update rejects an empty change and conflicting conditions', async () => {
		await expect(
			run({ operation: 'update', automationRule, ruleUpdateFields: {} }),
		).rejects.toThrow('Add at least one field');
		await expect(
			run({
				operation: 'update',
				automationRule,
				ruleUpdateFields: { clearConditions: true, ruleConditions: JSON.stringify([condition]) },
			}),
		).rejects.toThrow('not both');
		await expect(
			run({ operation: 'update', automationRule, ruleUpdateFields: { ruleName: '' } }),
		).rejects.toThrow('Name is required');
	});

	it('is wired into the node and needs a session', () => {
		const node = new OpenWa();
		const resource = node.description.properties.find((p) => p.name === 'resource');
		expect(resource?.options).toContainEqual({ name: 'Automation Rule', value: 'automationRule' });
		expect(node.methods.listSearch.searchAutomationRules).toBe(searchAutomationRules);
		expect(isSessionless('automationRule', 'getAll')).toBe(false);
	});

	it('the list search labels rules by name and state', async () => {
		const { ctx } = fakeContext({}, [
			{ id: 'r1', name: 'Greeting', enabled: true },
			{ id: 'r2', name: 'Prices', enabled: false },
		]);
		const lctx = {
			...ctx,
			getCurrentNodeParameter: () => 's1',
		} as unknown as ILoadOptionsFunctions;
		expect(await searchAutomationRules.call(lctx)).toEqual({
			results: [
				{ name: 'Greeting (enabled)', value: 'r1' },
				{ name: 'Prices (disabled)', value: 'r2' },
			],
		});
		expect((await searchAutomationRules.call(lctx, 'pri')).results).toHaveLength(1);
	});
});
