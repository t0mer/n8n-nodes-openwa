import type { IExecuteFunctions } from 'n8n-workflow';

/** Whether the node running this item is at `version` or later (for version-gated output). */
export function atLeast(ctx: Pick<IExecuteFunctions, 'getNode'>, version: number): boolean {
	return ctx.getNode().typeVersion >= version;
}
