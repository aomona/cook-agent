import { beforeEach, describe, expect, test, vi } from 'vitest';

const { fetchMock, lookupMock } = vi.hoisted(() => ({
	fetchMock: vi.fn(),
	lookupMock: vi.fn(),
}));

vi.stubGlobal('fetch', fetchMock);

vi.mock('node:dns/promises', async () => {
	const actual = await vi.importActual<typeof import('node:dns/promises')>('node:dns/promises');

	return {
		...actual,
		lookup: lookupMock,
	};
});

vi.mock('server-only', () => ({}));

import { assertSafePublicHttpUrl, fetchSafePublicText } from './safe-url';

describe('assertSafePublicHttpUrl', () => {
	beforeEach(() => {
		fetchMock.mockReset();
		lookupMock.mockReset();
	});

	test.each([
		'http://0.0.0.0:3000',
		'http://100.64.0.1',
		'http://198.51.100.10',
		'http://224.0.0.1',
	])('rejects blocked IPv4 ranges for %s', async (value) => {
		await expect(assertSafePublicHttpUrl(value)).rejects.toThrow('この URL は取得できません。');
	});

	test('allows public IP addresses', async () => {
		await expect(assertSafePublicHttpUrl('https://8.8.8.8/recipe')).resolves.toMatchObject({
			hostname: '8.8.8.8',
		});
		expect(lookupMock).not.toHaveBeenCalled();
	});

	test('blocks redirects to private addresses', async () => {
		lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
		fetchMock.mockResolvedValue(
			new Response(null, {
				headers: {
					location: 'http://127.0.0.1/internal',
				},
				status: 302,
			}),
		);

		await expect(fetchSafePublicText('https://example.com/recipe')).rejects.toThrow(
			'この URL は取得できません。',
		);
	});

	test('follows safe redirects and returns the final response body', async () => {
		lookupMock
			.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])
			.mockResolvedValueOnce([{ address: '93.184.216.35', family: 4 }]);
		fetchMock
			.mockResolvedValueOnce(
				new Response(null, {
					headers: {
						location: 'https://www.example.com/recipe',
					},
					status: 302,
				}),
			)
			.mockResolvedValueOnce(new Response('recipe body', { status: 200 }));

		await expect(fetchSafePublicText('https://example.com/recipe')).resolves.toMatchObject({
			text: 'recipe body',
			url: {
				hostname: 'www.example.com',
			},
		});
	});

	test('rejects oversized responses', async () => {
		lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
		fetchMock.mockResolvedValue(new Response('abcdef', { status: 200 }));

		await expect(
			fetchSafePublicText('https://example.com/recipe', {
				maxResponseBytes: 4,
			}),
		).rejects.toThrow('取得したページが大きすぎます。別の URL を試してください。');
	});
});
