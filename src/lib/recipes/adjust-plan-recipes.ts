import 'server-only';

import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { planRecipeSources, plans, recipeSources } from '@/db/schema';
import { getUserPlanningSettingsState } from '@/lib/planning-settings-queries';
import type { NormalizedRecipe, RecipeMaterialChange, RecipeStepChange } from '@/lib/plans/types';
import { adaptRecipeServings } from '@/lib/recipes/adapt-recipe-servings';

const getErrorMessage = (error: unknown): string => {
	if (error instanceof Error && error.message) {
		return error.message;
	}

	return 'レシピの最適化に失敗しました。';
};

const getBaseServings = ({
	baseServingsOverride,
	normalizedRecipe,
}: {
	baseServingsOverride: number | null;
	normalizedRecipe: NormalizedRecipe | null;
}): number | null => baseServingsOverride ?? normalizedRecipe?.servings ?? null;

const clearAdjustmentColumns: {
	adjustedAt: null;
	adjustedForServings: null;
	adjustedRecipe: null;
	adjustmentAttemptCount: number;
	adjustmentConfirmedAt: null;
	adjustmentError: null;
	materialChanges: RecipeMaterialChange[];
	stepChanges: RecipeStepChange[];
} = {
	adjustedAt: null,
	adjustedForServings: null,
	adjustedRecipe: null,
	adjustmentAttemptCount: 0,
	adjustmentConfirmedAt: null,
	adjustmentError: null,
	materialChanges: [],
	stepChanges: [],
};

export const syncAdjustedRecipeForPlan = async ({
	force = false,
	planId,
	recipeSourceId,
}: {
	force?: boolean;
	planId: string;
	recipeSourceId: string;
}): Promise<void> => {
	const [linkedRecipe] = await db
		.select({
			adjustedForServings: planRecipeSources.adjustedForServings,
			adjustedRecipe: planRecipeSources.adjustedRecipe,
			adjustmentAttemptCount: planRecipeSources.adjustmentAttemptCount,
			adjustmentStatus: planRecipeSources.adjustmentStatus,
			baseServingsOverride: planRecipeSources.baseServingsOverride,
			normalizedRecipe: recipeSources.normalizedRecipe,
			planStatus: plans.status,
			processingStatus: recipeSources.processingStatus,
			requestedServings: plans.requestedServings,
			userId: plans.userId,
		})
		.from(planRecipeSources)
		.innerJoin(plans, eq(planRecipeSources.planId, plans.id))
		.innerJoin(recipeSources, eq(planRecipeSources.recipeSourceId, recipeSources.id))
		.where(
			and(
				eq(planRecipeSources.planId, planId),
				eq(planRecipeSources.recipeSourceId, recipeSourceId),
			),
		);

	if (!linkedRecipe || linkedRecipe.planStatus === 'archived') {
		return;
	}

	if (linkedRecipe.processingStatus !== 'completed' || !linkedRecipe.normalizedRecipe) {
		await db
			.update(planRecipeSources)
			.set({
				...clearAdjustmentColumns,
				adjustmentStatus: 'idle',
			})
			.where(
				and(
					eq(planRecipeSources.planId, planId),
					eq(planRecipeSources.recipeSourceId, recipeSourceId),
				),
			);

		return;
	}

	if (!linkedRecipe.requestedServings) {
		await db
			.update(planRecipeSources)
			.set({
				...clearAdjustmentColumns,
				adjustmentStatus: 'idle',
			})
			.where(
				and(
					eq(planRecipeSources.planId, planId),
					eq(planRecipeSources.recipeSourceId, recipeSourceId),
				),
			);

		return;
	}

	const baseServings = getBaseServings({
		baseServingsOverride: linkedRecipe.baseServingsOverride,
		normalizedRecipe: linkedRecipe.normalizedRecipe,
	});

	if (!baseServings) {
		await db
			.update(planRecipeSources)
			.set({
				...clearAdjustmentColumns,
				adjustmentStatus: 'needs_base_servings',
			})
			.where(
				and(
					eq(planRecipeSources.planId, planId),
					eq(planRecipeSources.recipeSourceId, recipeSourceId),
				),
			);

		return;
	}

	if (
		!force &&
		linkedRecipe.adjustmentStatus === 'completed' &&
		linkedRecipe.adjustedRecipe &&
		linkedRecipe.adjustedForServings === linkedRecipe.requestedServings
	) {
		return;
	}

	const planningSettingsState = await getUserPlanningSettingsState(linkedRecipe.userId);

	await db
		.update(planRecipeSources)
		.set({
			...clearAdjustmentColumns,
			adjustmentStatus: 'adjusting',
		})
		.where(
			and(
				eq(planRecipeSources.planId, planId),
				eq(planRecipeSources.recipeSourceId, recipeSourceId),
			),
		);

	for (let attempt = 1; attempt <= 2; attempt += 1) {
		await db
			.update(planRecipeSources)
			.set({
				adjustmentAttemptCount: attempt,
				adjustmentStatus: 'adjusting',
			})
			.where(
				and(
					eq(planRecipeSources.planId, planId),
					eq(planRecipeSources.recipeSourceId, recipeSourceId),
				),
			);

		try {
			const { adjustedRecipe, materialChanges, stepChanges } = await adaptRecipeServings({
				baseServings,
				planningSettings: planningSettingsState.settings,
				recipe: linkedRecipe.normalizedRecipe,
				targetServings: linkedRecipe.requestedServings,
			});

			await db
				.update(planRecipeSources)
				.set({
					adjustedAt: new Date(),
					adjustedForServings: linkedRecipe.requestedServings,
					adjustedRecipe,
					adjustmentAttemptCount: attempt,
					adjustmentConfirmedAt: null,
					adjustmentError: null,
					adjustmentStatus: 'completed',
					materialChanges,
					stepChanges,
				})
				.where(
					and(
						eq(planRecipeSources.planId, planId),
						eq(planRecipeSources.recipeSourceId, recipeSourceId),
					),
				);

			return;
		} catch (error) {
			if (attempt < 2) {
				continue;
			}

			await db
				.update(planRecipeSources)
				.set({
					...clearAdjustmentColumns,
					adjustmentAttemptCount: attempt,
					adjustmentError: getErrorMessage(error),
					adjustmentStatus: 'action_required',
				})
				.where(
					and(
						eq(planRecipeSources.planId, planId),
						eq(planRecipeSources.recipeSourceId, recipeSourceId),
					),
				);
		}
	}
};

export const syncAdjustedRecipesForPlan = async (planId: string): Promise<void> => {
	const recipeLinks = await db
		.select({
			recipeSourceId: planRecipeSources.recipeSourceId,
		})
		.from(planRecipeSources)
		.where(eq(planRecipeSources.planId, planId));

	for (const recipeLink of recipeLinks) {
		await syncAdjustedRecipeForPlan({
			planId,
			recipeSourceId: recipeLink.recipeSourceId,
		});
	}
};

export const syncAdjustedRecipesForLinkedSource = async (recipeSourceId: string): Promise<void> => {
	const planLinks = await db
		.select({
			planId: planRecipeSources.planId,
		})
		.from(planRecipeSources)
		.innerJoin(plans, eq(planRecipeSources.planId, plans.id))
		.where(and(eq(planRecipeSources.recipeSourceId, recipeSourceId), eq(plans.status, 'draft')));

	for (const planLink of planLinks) {
		await syncAdjustedRecipeForPlan({
			planId: planLink.planId,
			recipeSourceId,
		});
	}
};

export const confirmAdjustedRecipesForPlan = async ({
	planId,
	userId,
}: {
	planId: string;
	userId: string;
}): Promise<void> => {
	const recipeLinks = await db
		.select({
			adjustmentStatus: planRecipeSources.adjustmentStatus,
			recipeSourceId: planRecipeSources.recipeSourceId,
		})
		.from(planRecipeSources)
		.innerJoin(plans, eq(planRecipeSources.planId, plans.id))
		.where(
			and(
				eq(planRecipeSources.planId, planId),
				eq(plans.userId, userId),
				eq(plans.status, 'draft'),
			),
		);

	if (recipeLinks.length === 0) {
		throw new Error('レシピがありません。');
	}

	if (recipeLinks.some((recipe) => recipe.adjustmentStatus !== 'completed')) {
		throw new Error('レシピの最適化が完了していません。');
	}

	await db
		.update(planRecipeSources)
		.set({
			adjustmentConfirmedAt: new Date(),
		})
		.where(eq(planRecipeSources.planId, planId));
};

export const invalidateAdjustedRecipesForUser = async (userId: string): Promise<void> => {
	const draftPlans = await db
		.select({
			id: plans.id,
		})
		.from(plans)
		.where(and(eq(plans.userId, userId), eq(plans.status, 'draft')));

	for (const draftPlan of draftPlans) {
		await db
			.update(planRecipeSources)
			.set({
				...clearAdjustmentColumns,
				adjustmentStatus: 'idle',
			})
			.where(eq(planRecipeSources.planId, draftPlan.id));
	}
};
