'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { after } from 'next/server';
import { z } from 'zod';
import {
	type CreateRecipeItem,
	createRecipeSourceForPlan,
	deleteRecipeSourceFromPlan,
	getRequestActor,
	type RecipeInputMode,
	retryRecipeAdjustmentForPlan,
	updateRecipeBaseServingsForPlan,
	updateRecipeSourceInputForPlan,
	updateRequestedServingsForPlan,
} from '@/lib/create-session';
import {
	confirmAdjustedRecipesForPlan,
	syncAdjustedRecipeForPlan,
	syncAdjustedRecipesForPlan,
} from '@/lib/recipes/adjust-plan-recipes';
import { processRecipeSourceAndSyncPlans } from '@/lib/recipes/process-recipe-source';

const trimmedUrlSchema = z
	.string()
	.trim()
	.pipe(z.url({ error: '有効なURLを入力してください。' }));

const addRecipeInputSchema = z.discriminatedUnion('type', [
	z.object({
		planId: z.uuid(),
		type: z.literal('url'),
		value: trimmedUrlSchema,
	}),
	z.object({
		planId: z.uuid(),
		type: z.literal('text'),
		value: z.string().trim().min(1),
	}),
]);

const updateRecipeServingsInputSchema = z.object({
	planId: z.uuid(),
	recipeId: z.uuid(),
	servings: z.number().int().min(1).max(100),
});

const updateRequestedServingsInputSchema = z.object({
	planId: z.uuid(),
	requestedServings: z.number().int().min(1).max(24),
});

const retryRecipeAdjustmentInputSchema = z.object({
	planId: z.uuid(),
	recipeId: z.uuid(),
});

const confirmAdjustedRecipesInputSchema = z.object({
	planId: z.uuid(),
});

const updateRecipeInputSchema = z.discriminatedUnion('type', [
	z.object({
		planId: z.uuid(),
		recipeId: z.uuid(),
		type: z.literal('url'),
		value: trimmedUrlSchema,
	}),
	z.object({
		planId: z.uuid(),
		recipeId: z.uuid(),
		type: z.literal('text'),
		value: z.string().trim().min(1),
	}),
]);

const deleteRecipeInputSchema = z.object({
	planId: z.uuid(),
	recipeId: z.uuid(),
});

const normalizeUrl = (value: string): string => {
	const url = new URL(value);
	return url.toString();
};

const requireRequestActor = async (): Promise<{ userId: string }> => {
	const cookieStore = await cookies();
	const actor = await getRequestActor(cookieStore);

	if (!actor) {
		throw new Error('Unauthorized.');
	}

	return actor;
};

const revalidatePlanRoutes = (planId: string): void => {
	revalidatePath('/');
	revalidatePath('/create');
	revalidatePath('/create/servings');
	revalidatePath(`/plans/${planId}`);
	revalidatePath(`/plans/${planId}/edit`);
};

export const addRecipeToPlanAction = async ({
	planId,
	type,
	value,
}: {
	planId: string;
	type: RecipeInputMode;
	value: string;
}): Promise<{ recipe: CreateRecipeItem }> => {
	const actor = await requireRequestActor();
	const payload = addRecipeInputSchema.parse({
		planId,
		type,
		value,
	});
	const normalizedValue = payload.type === 'url' ? normalizeUrl(payload.value) : payload.value;
	const recipe = await createRecipeSourceForPlan({
		planId: payload.planId,
		userId: actor.userId,
		type: payload.type,
		value: normalizedValue,
	});

	after(async () => {
		await processRecipeSourceAndSyncPlans(recipe.id, {
			sourceText: payload.type === 'text' ? normalizedValue : undefined,
		});
	});

	revalidatePlanRoutes(payload.planId);

	return { recipe };
};

export const updateRecipeBaseServingsAction = async ({
	planId,
	recipeId,
	servings,
}: {
	planId: string;
	recipeId: string;
	servings: number;
}): Promise<{ recipe: CreateRecipeItem }> => {
	const actor = await requireRequestActor();
	const payload = updateRecipeServingsInputSchema.parse({
		planId,
		recipeId,
		servings,
	});
	const recipe = await updateRecipeBaseServingsForPlan({
		planId: payload.planId,
		recipeSourceId: payload.recipeId,
		servings: payload.servings,
		userId: actor.userId,
	});

	after(async () => {
		await syncAdjustedRecipeForPlan({
			planId: payload.planId,
			recipeSourceId: payload.recipeId,
		});
	});

	revalidatePlanRoutes(payload.planId);

	return { recipe };
};

export const updateRequestedServingsAction = async ({
	planId,
	requestedServings,
}: {
	planId: string;
	requestedServings: number;
}): Promise<void> => {
	const actor = await requireRequestActor();
	const payload = updateRequestedServingsInputSchema.parse({
		planId,
		requestedServings,
	});

	await updateRequestedServingsForPlan({
		planId: payload.planId,
		requestedServings: payload.requestedServings,
		userId: actor.userId,
	});

	after(async () => {
		await syncAdjustedRecipesForPlan(payload.planId);
	});

	revalidatePlanRoutes(payload.planId);
};

export const retryRecipeAdjustmentAction = async ({
	planId,
	recipeId,
}: {
	planId: string;
	recipeId: string;
}): Promise<void> => {
	const actor = await requireRequestActor();
	const payload = retryRecipeAdjustmentInputSchema.parse({
		planId,
		recipeId,
	});

	await retryRecipeAdjustmentForPlan({
		planId: payload.planId,
		recipeSourceId: payload.recipeId,
		userId: actor.userId,
	});

	after(async () => {
		await syncAdjustedRecipeForPlan({
			planId: payload.planId,
			recipeSourceId: payload.recipeId,
		});
	});

	revalidatePlanRoutes(payload.planId);
};

export const confirmAdjustedRecipesAction = async ({
	planId,
}: {
	planId: string;
}): Promise<void> => {
	const actor = await requireRequestActor();
	const payload = confirmAdjustedRecipesInputSchema.parse({
		planId,
	});

	await confirmAdjustedRecipesForPlan({
		planId: payload.planId,
		userId: actor.userId,
	});

	revalidatePlanRoutes(payload.planId);
};

export const updateRecipeInputAction = async ({
	planId,
	recipeId,
	type,
	value,
}: {
	planId: string;
	recipeId: string;
	type: RecipeInputMode;
	value: string;
}): Promise<{ recipe: CreateRecipeItem }> => {
	const actor = await requireRequestActor();
	const payload = updateRecipeInputSchema.parse({
		planId,
		recipeId,
		type,
		value,
	});
	const normalizedValue = payload.type === 'url' ? normalizeUrl(payload.value) : payload.value;
	const recipe = await updateRecipeSourceInputForPlan({
		mode: payload.type,
		planId: payload.planId,
		recipeSourceId: payload.recipeId,
		userId: actor.userId,
		value: normalizedValue,
	});

	after(async () => {
		await processRecipeSourceAndSyncPlans(payload.recipeId, {
			sourceText: payload.type === 'text' ? normalizedValue : undefined,
		});
	});

	revalidatePlanRoutes(payload.planId);

	return { recipe };
};

export const deleteRecipeFromPlanAction = async ({
	planId,
	recipeId,
}: {
	planId: string;
	recipeId: string;
}): Promise<void> => {
	const actor = await requireRequestActor();
	const payload = deleteRecipeInputSchema.parse({
		planId,
		recipeId,
	});

	await deleteRecipeSourceFromPlan({
		planId: payload.planId,
		recipeSourceId: payload.recipeId,
		userId: actor.userId,
	});

	revalidatePlanRoutes(payload.planId);
};
