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
	updateRecipeServingsForPlan,
} from '@/lib/create-session';
import { processRecipeSource } from '@/lib/recipes/process-recipe-source';

const addRecipeInputSchema = z.discriminatedUnion('type', [
	z.object({
		planId: z.string().uuid(),
		type: z.literal('url'),
		value: z.string().trim().url('有効なURLを入力してください。'),
	}),
	z.object({
		planId: z.string().uuid(),
		type: z.literal('text'),
		value: z.string().trim().min(1),
	}),
]);

const updateRecipeServingsInputSchema = z.object({
	planId: z.string().uuid(),
	recipeId: z.string().uuid(),
	servings: z.number().int().min(1).max(100),
});

const deleteRecipeInputSchema = z.object({
	planId: z.string().uuid(),
	recipeId: z.string().uuid(),
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
		await processRecipeSource(recipe.id, {
			sourceText: payload.type === 'text' ? normalizedValue : undefined,
		});
	});

	revalidatePlanRoutes(payload.planId);

	return { recipe };
};

export const updateRecipeServingsAction = async ({
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
	const recipe = await updateRecipeServingsForPlan({
		planId: payload.planId,
		recipeSourceId: payload.recipeId,
		servings: payload.servings,
		userId: actor.userId,
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
