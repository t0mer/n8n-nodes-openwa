import {
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type IHttpRequestMethods,
} from 'n8n-workflow';
import { openWaApiRequest } from '../transport/request';
import { parseFilterConditions } from '../trigger/webhook';

/** Run one Automation Rule operation for item `i`. Get Many returns one object per rule. */
export async function executeAutomationRule(
	ctx: IExecuteFunctions,
	i: number,
	sessionId: string,
): Promise<IDataObject | IDataObject[]> {
	const operation = ctx.getNodeParameter('operation', i) as string;
	const request = (method: IHttpRequestMethods, path: string, body?: IDataObject) =>
		openWaApiRequest.call(ctx, method, path, { body, sessionId, itemIndex: i }) as Promise<
			IDataObject | IDataObject[]
		>;
	const fail = (message: string) =>
		new NodeOperationError(ctx.getNode(), message, { itemIndex: i });

	const base = `/api/sessions/${encodeURIComponent(sessionId)}/automation-rules`;
	switch (operation) {
		case 'getAll': {
			// Already in evaluation order; the gateway doesn't paginate.
			const rules = (await request('GET', base)) as IDataObject[];
			if (ctx.getNodeParameter('returnAll', i) as boolean) return rules;
			return rules.slice(0, ctx.getNodeParameter('limit', i) as number);
		}
		case 'create': {
			const options = ctx.getNodeParameter('ruleOptions', i, {}) as IDataObject;
			const body: IDataObject = {
				name: checkName(ctx.getNodeParameter('ruleName', i)),
				replyText: checkReplyText(ctx.getNodeParameter('replyText', i)),
			};
			// Empty conditions are left out: the gateway then matches every inbound message.
			const conditions = getConditions(options.ruleConditions);
			if (conditions) body.conditions = conditions;
			if (options.cooldownSeconds !== undefined) {
				body.cooldownSeconds = checkCooldown(options.cooldownSeconds);
			}
			if (options.enabled !== undefined) body.enabled = options.enabled === true;
			return await request('POST', base, body);
		}
	}

	const ruleId = String(
		ctx.getNodeParameter('automationRule', i, '', { extractValue: true }) ?? '',
	).trim();
	if (!ruleId) throw fail('Rule is required');
	const path = `${base}/${encodeURIComponent(ruleId)}`;

	switch (operation) {
		case 'get':
			return await request('GET', path);
		case 'delete':
			// 204 with no body.
			await request('DELETE', path);
			return { success: true, ruleId };
		case 'update':
			return await request('PUT', path, buildUpdate(ctx, i));
		default:
			throw fail(`Unsupported operation "${operation}"`);
	}
}

/** The Update Fields as an UpdateAutomationRuleDto; at least one change is required. */
function buildUpdate(ctx: IExecuteFunctions, i: number): IDataObject {
	const fields = ctx.getNodeParameter('ruleUpdateFields', i, {}) as IDataObject;
	const body: IDataObject = {};
	if (fields.ruleName !== undefined) body.name = checkName(fields.ruleName);
	if (fields.replyText !== undefined) body.replyText = checkReplyText(fields.replyText);
	if (fields.cooldownSeconds !== undefined) {
		body.cooldownSeconds = checkCooldown(fields.cooldownSeconds);
	}
	if (fields.enabled !== undefined) body.enabled = fields.enabled === true;

	const conditions = getConditions(fields.ruleConditions);
	if (fields.clearConditions === true) {
		if (conditions) throw new Error('Set either Conditions or Clear Conditions, not both');
		// null removes the conditions (the gateway rejects an empty object): the rule then matches
		// every inbound message.
		body.conditions = null;
	} else if (conditions) {
		body.conditions = conditions;
	}

	if (!Object.keys(body).length) throw new Error('Add at least one field to update');
	return body;
}

function checkName(value: unknown): string {
	const name = String(value ?? '').trim();
	if (!name) throw new Error('Name is required');
	if (name.length > 100) throw new Error('Name must be at most 100 characters long');
	return name;
}

function checkReplyText(value: unknown): string {
	const text = String(value ?? '');
	if (!text.trim()) throw new Error('Reply Text is required');
	if (text.length > 4096) throw new Error('Reply Text must be at most 4096 characters long');
	return text;
}

function checkCooldown(value: unknown): number {
	const seconds = Number(value);
	if (!Number.isInteger(seconds) || seconds < 0 || seconds > 86400) {
		throw new Error('Cooldown must be a whole number of seconds from 0 to 86400');
	}
	return seconds;
}

/** The Conditions (JSON) field in the webhook filter format `{ conditions }`, or undefined when empty. */
function getConditions(value: unknown): IDataObject | undefined {
	if (value === undefined || value === null || String(value).trim() === '') return undefined;
	return { conditions: parseFilterConditions(value) as unknown as IDataObject[] };
}
