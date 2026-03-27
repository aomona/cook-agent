import 'server-only';

import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { planRecipeSources, plans, recipeSources } from '@/db/schema';
import type { NormalizedRecipe, RecipeStepChange } from '@/lib/plans/types';
import { adaptRecipeServings } from '@/lib/recipes/adapt-recipe-servings';

const getErrorMessage = (error: unknown): string => {
	if (error instanceof Error && error.message) {
		return error.message;
	}

	return '人数に合わせた手順の調整に失敗しました。';
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
	adjustmentError: null;
	stepChanges: RecipeStepChange[];
} = {
	adjustedAt: null,
	adjustedForServings: null,
	adjustedRecipe: null,
	adjustmentAttemptCount: 0,
	adjustmentError: null,
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
			const { adjustedRecipe, stepChanges } = await adaptRecipeServings({
				baseServings,
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
					adjustmentError: null,
					adjustmentStatus: 'completed',
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
