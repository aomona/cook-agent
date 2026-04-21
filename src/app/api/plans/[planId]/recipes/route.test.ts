import { beforeEach, describe, expect, test, vi } from 'vitest';

const {
	afterMock,
	cookiesMock,
	createRecipeSourceForPlanMock,
	getRequestActorMock,
	processRecipeSourceAndSyncPlansMock,
} = vi.hoisted(() => ({
	afterMock: vi.fn(),
	cookiesMock: vi.fn(),
	createRecipeSourceForPlanMock: vi.fn(),
	getRequestActorMock: vi.fn(),
	processRecipeSourceAndSyncPlansMock: vi.fn(),
}));

vi.mock('next/headers', () => ({
	cookies: cookiesMock,
}));

vi.mock('next/server', () => ({
	after: afterMock,
}));

vi.mock('@/lib/create-session', () => ({
	createRecipeSourceForPlan: createRecipeSourceForPlanMock,
	getRequestActor: getRequestActorMock,
}));

vi.mock('@/lib/recipes/process-recipe-source', () => ({
	processRecipeSourceAndSyncPlans: processRecipeSourceAndSyncPlansMock,
}));

import { POST } from './route';

describe('POST /api/plans/[planId]/recipes', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		cookiesMock.mockResolvedValue({});
		getRequestActorMock.mockResolvedValue({ userId: 'user-1' });
		afterMock.mockImplementation(async (callback: () => Promise<void>) => {
			await callback();
		});
		createRecipeSourceForPlanMock.mockResolvedValue({ id: 'recipe-1' });
		processRecipeSourceAndSyncPlansMock.mockResolvedValue(undefined);
	});

	test('schedules recipe processing with linked plan sync', async () => {
		const response = await POST(
			new Request('http://localhost/api/plans/plan-1/recipes', {
				body: JSON.stringify({
					type: 'text',
					value: 'レシピ本文',
				}),
				method: 'POST',
			}),
			{
				params: Promise.resolve({
					planId: 'plan-1',
				}),
			},
		);

		expect(response.status).toBe(202);
		expect(createRecipeSourceForPlanMock).toHaveBeenCalledWith({
			planId: 'plan-1',
			type: 'text',
			userId: 'user-1',
			value: 'レシピ本文',
		});
		expect(processRecipeSourceAndSyncPlansMock).toHaveBeenCalledWith('recipe-1', {
			sourceText: 'レシピ本文',
		});
	});
});
