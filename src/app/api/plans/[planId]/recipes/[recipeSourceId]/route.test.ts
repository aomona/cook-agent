import { beforeEach, describe, expect, test, vi } from 'vitest';

const {
	afterMock,
	cookiesMock,
	deleteRecipeSourceFromPlanMock,
	getRequestActorMock,
	syncAdjustedRecipeForPlanMock,
	updateRecipeBaseServingsForPlanMock,
} = vi.hoisted(() => ({
	afterMock: vi.fn(),
	cookiesMock: vi.fn(),
	deleteRecipeSourceFromPlanMock: vi.fn(),
	getRequestActorMock: vi.fn(),
	syncAdjustedRecipeForPlanMock: vi.fn(),
	updateRecipeBaseServingsForPlanMock: vi.fn(),
}));

vi.mock('next/headers', () => ({
	cookies: cookiesMock,
}));

vi.mock('next/server', () => ({
	after: afterMock,
}));

vi.mock('@/lib/create-session', () => ({
	deleteRecipeSourceFromPlan: deleteRecipeSourceFromPlanMock,
	getRequestActor: getRequestActorMock,
	updateRecipeBaseServingsForPlan: updateRecipeBaseServingsForPlanMock,
}));

vi.mock('@/lib/recipes/adjust-plan-recipes', () => ({
	syncAdjustedRecipeForPlan: syncAdjustedRecipeForPlanMock,
}));

import { PATCH } from './route';

describe('PATCH /api/plans/[planId]/recipes/[recipeSourceId]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		cookiesMock.mockResolvedValue({});
		getRequestActorMock.mockResolvedValue({ userId: 'user-1' });
		afterMock.mockImplementation(async (callback: () => Promise<void>) => {
			await callback();
		});
		updateRecipeBaseServingsForPlanMock.mockResolvedValue({ id: 'recipe-1' });
		syncAdjustedRecipeForPlanMock.mockResolvedValue(undefined);
	});

	test('resyncs adjusted recipe after updating base servings', async () => {
		const planId = '11111111-1111-4111-8111-111111111111';
		const recipeSourceId = '22222222-2222-4222-8222-222222222222';

		const response = await PATCH(
			new Request(`http://localhost/api/plans/${planId}/recipes/${recipeSourceId}`, {
				body: JSON.stringify({ servings: 4 }),
				headers: {
					origin: 'http://localhost',
				},
				method: 'PATCH',
			}),
			{
				params: Promise.resolve({
					planId,
					recipeSourceId,
				}),
			},
		);

		expect(response.status).toBe(200);
		expect(updateRecipeBaseServingsForPlanMock).toHaveBeenCalledWith({
			planId,
			recipeSourceId,
			servings: 4,
			userId: 'user-1',
		});
		expect(syncAdjustedRecipeForPlanMock).toHaveBeenCalledWith({
			planId,
			recipeSourceId,
		});
	});

	test('returns 403 when the origin header is missing', async () => {
		const planId = '11111111-1111-4111-8111-111111111111';
		const recipeSourceId = '22222222-2222-4222-8222-222222222222';

		const response = await PATCH(
			new Request(`http://localhost/api/plans/${planId}/recipes/${recipeSourceId}`, {
				body: JSON.stringify({ servings: 4 }),
				method: 'PATCH',
			}),
			{
				params: Promise.resolve({
					planId,
					recipeSourceId,
				}),
			},
		);

		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toEqual({ message: 'Forbidden.' });
		expect(updateRecipeBaseServingsForPlanMock).not.toHaveBeenCalled();
	});
});
