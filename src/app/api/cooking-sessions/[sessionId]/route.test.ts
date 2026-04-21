import { beforeEach, describe, expect, test, vi } from 'vitest';

const { cookiesMock, getOwnedCookSessionSnapshotBySessionIdMock, getRequestActorMock } = vi.hoisted(
	() => ({
		cookiesMock: vi.fn(),
		getOwnedCookSessionSnapshotBySessionIdMock: vi.fn(),
		getRequestActorMock: vi.fn(),
	}),
);

vi.mock('next/headers', () => ({
	cookies: cookiesMock,
}));

vi.mock('@/lib/cook-runtime/queries', () => ({
	getOwnedCookSessionSnapshotBySessionId: getOwnedCookSessionSnapshotBySessionIdMock,
}));

vi.mock('@/lib/create-session', () => ({
	getRequestActor: getRequestActorMock,
}));

import { GET } from './route';

describe('GET /api/cooking-sessions/[sessionId]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		cookiesMock.mockResolvedValue({});
		getRequestActorMock.mockResolvedValue({ userId: 'user-1' });
		getOwnedCookSessionSnapshotBySessionIdMock.mockResolvedValue(null);
	});

	test('returns 400 for invalid session ids', async () => {
		const response = await GET(new Request('http://localhost/api/cooking-sessions/not-a-uuid'), {
			params: Promise.resolve({
				sessionId: 'not-a-uuid',
			}),
		});

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({
			message: 'Invalid cooking session identifier.',
		});
		expect(getOwnedCookSessionSnapshotBySessionIdMock).not.toHaveBeenCalled();
	});
});
