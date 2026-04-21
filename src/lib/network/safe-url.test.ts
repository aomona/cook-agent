import { describe, expect, test, vi } from 'vitest';

const { lookupMock } = vi.hoisted(() => ({
	lookupMock: vi.fn(),
}));

vi.mock('node:dns/promises', async () => {
	const actual = await vi.importActual<typeof import('node:dns/promises')>('node:dns/promises');

	return {
		...actual,
		lookup: lookupMock,
	};
});

vi.mock('server-only', () => ({}));

import { assertSafePublicHttpUrl } from './safe-url';

describe('assertSafePublicHttpUrl', () => {
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
});
