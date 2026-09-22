import { describe, expect, it } from 'vitest';
import { MAX_BINARY_BYTES, assertBinarySize, buildMediaBody } from '../nodes/OpenWa/helpers/media';

describe('buildMediaBody — URL source', () => {
	it('passes through a trimmed http(s) URL', () => {
		expect(buildMediaBody({ source: 'url', url: ' https://example.com/a.jpg ' })).toEqual({
			url: 'https://example.com/a.jpg',
		});
		expect(buildMediaBody({ source: 'url', url: 'http://example.com/a.jpg' })).toEqual({
			url: 'http://example.com/a.jpg',
		});
	});

	it('rejects invalid URLs and non-http protocols', () => {
		expect(() => buildMediaBody({ source: 'url', url: 'not a url' })).toThrow('not a valid URL');
		expect(() => buildMediaBody({ source: 'url', url: '' })).toThrow('not a valid URL');
		expect(() => buildMediaBody({ source: 'url', url: 'file:///etc/passwd' })).toThrow(
			'http or https',
		);
	});
});

describe('buildMediaBody — binary source', () => {
	it('encodes base64 with mimetype and filename', () => {
		const data = Buffer.from('hello');
		expect(
			buildMediaBody({ source: 'binary', data, mimeType: 'image/png', fileName: 'a.png' }),
		).toEqual({ base64: 'aGVsbG8=', mimetype: 'image/png', filename: 'a.png' });
	});

	it('defaults the mimetype and omits a missing filename', () => {
		expect(buildMediaBody({ source: 'binary', data: Buffer.from('x') })).toEqual({
			base64: 'eA==',
			mimetype: 'application/octet-stream',
		});
	});

	it('rejects an empty buffer', () => {
		expect(() => buildMediaBody({ source: 'binary', data: Buffer.alloc(0) })).toThrow('empty');
	});

	it('rejects a buffer above the limit', () => {
		const data = Buffer.alloc(MAX_BINARY_BYTES + 1);
		expect(() => buildMediaBody({ source: 'binary', data })).toThrow(/above the 18\.0 MB limit/);
	});
});

describe('assertBinarySize', () => {
	it('accepts exactly the limit and rejects one byte more', () => {
		expect(() => assertBinarySize(MAX_BINARY_BYTES)).not.toThrow();
		expect(() => assertBinarySize(MAX_BINARY_BYTES + 1)).toThrow(/send it by URL/);
	});

	it('keeps base64 of the limit inside the 25 MB body cap', () => {
		expect(Math.ceil(MAX_BINARY_BYTES / 3) * 4).toBeLessThan(25 * 1024 * 1024);
	});
});
