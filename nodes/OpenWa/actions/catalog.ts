import { NodeOperationError, type IDataObject, type IExecuteFunctions } from 'n8n-workflow';
import { openWaApiRequest } from '../transport/request';

/** Products requested per page when paging through the catalog. */
const PRODUCT_PAGE_SIZE = 100;

/** The catalog routes answer an empty body for "nothing there" instead of a 404. */
const isEmpty = (response: unknown): boolean =>
	!response || typeof response !== 'object' || Object.keys(response).length === 0;

/** Run one Catalog operation for item `i`. Get Products returns one object per product. */
export async function executeCatalog(
	ctx: IExecuteFunctions,
	i: number,
	sessionId: string,
): Promise<IDataObject | IDataObject[]> {
	const operation = ctx.getNodeParameter('operation', i) as string;
	const request = (path: string, qs?: IDataObject) =>
		openWaApiRequest.call(
			ctx,
			'GET',
			`/api/sessions/${encodeURIComponent(sessionId)}/catalog${path}`,
			{ qs, sessionId, itemIndex: i },
		);

	switch (operation) {
		case 'get': {
			const catalog = await request('');
			// No collection to describe (e.g. no catalog set up): say so rather than output nothing.
			return isEmpty(catalog) ? { catalog: null } : (catalog as IDataObject);
		}
		case 'getProduct': {
			const productId = String(ctx.getNodeParameter('productId', i) ?? '').trim();
			if (!productId)
				throw new NodeOperationError(ctx.getNode(), 'Product ID is required', { itemIndex: i });
			const product = await request(`/products/${encodeURIComponent(productId)}`);
			if (isEmpty(product)) {
				throw new NodeOperationError(ctx.getNode(), `Product "${productId}" not found`, {
					itemIndex: i,
					description: 'No product in the catalog of this session carries that ID.',
				});
			}
			return product as IDataObject;
		}
		case 'getProducts': {
			const returnAll = ctx.getNodeParameter('returnAll', i) as boolean;
			const max = returnAll ? undefined : (ctx.getNodeParameter('limit', i) as number);
			// The page size must stay fixed across pages, so trim the last page instead.
			const limit = Math.min(PRODUCT_PAGE_SIZE, max ?? PRODUCT_PAGE_SIZE);
			const products: IDataObject[] = [];
			for (let page = 1; ; page++) {
				const response = (await request('/products', { page, limit })) as {
					products?: IDataObject[];
					pagination?: { totalPages?: number };
				};
				const batch = response?.products ?? [];
				products.push(...batch);
				if (max !== undefined && products.length >= max) return products.slice(0, max);
				const totalPages = Number(response?.pagination?.totalPages);
				if (batch.length < limit || !(page < totalPages)) return products;
			}
		}
		default:
			throw new NodeOperationError(ctx.getNode(), `Unsupported operation "${operation}"`, {
				itemIndex: i,
			});
	}
}
