import { cookies } from 'next/headers';
import { after } from 'next/server';
import { z } from 'zod';
import {
	deleteRecipeSourceFromPlan,
	getRequestActor,
	updateRecipeBaseServingsForPlan,
} from '@/lib/create-session';
import { getInvalidOriginResponse } from '@/lib/network/same-origin';
import { syncAdjustedRecipeForPlan } from '@/lib/recipes/adjust-plan-recipes';

const routeParamsSchema = z.object({
	planId: z.uuid(),
	recipeSourceId: z.uuid(),
});

const getDeleteRecipeErrorResponse = (
	error: unknown,
): { message: string; status: number; shouldLog?: boolean } => {
	if (error instanceof z.ZodError) {
		return { message: 'Invalid recipe identifier.', status: 400 };
	}

	if (error instanceof Error) {
		if (error.message === 'Recipe not found.' || error.message === 'Plan not found.') {
			return { message: error.message, status: 404 };
		}

		return { message: 'Failed to delete recipe.', status: 500, shouldLog: true };
	}

	return { message: 'Failed to delete recipe.', status: 500, shouldLog: true };
};

const updateRecipeServingsSchema = z.object({
	servings: z.number().int().min(1).max(100),
});

const getPatchRecipeErrorResponse = (
	error: unknown,
): { message: string; status: number; shouldLog?: boolean } => {
	if (error instanceof z.ZodError) {
		return { message: error.issues[0]?.message ?? 'Invalid recipe servings.', status: 400 };
	}

	if (error instanceof Error) {
		if (error.message === 'Recipe not found.' || error.message === 'Plan not found.') {
			return { message: error.message, status: 404 };
		}

		return { message: 'Failed to update recipe servings.', status: 500, shouldLog: true };
	}

	return { message: 'Failed to update recipe servings.', status: 500, shouldLog: true };
};

export const runtime = 'nodejs';

export async function PATCH(
	request: Request,
	context: { params: Promise<{ planId: string; recipeSourceId: string }> },
) {
	const invalidOriginResponse = getInvalidOriginResponse(request);

	if (invalidOriginResponse) {
		return invalidOriginResponse;
	}

	const cookieStore = await cookies();
	const actor = await getRequestActor(cookieStore);

	if (!actor) {
		return Response.json({ message: 'Unauthorized.' }, { status: 401 });
	}

	try {
		const params = routeParamsSchema.parse(await context.params);
		const body = updateRecipeServingsSchema.parse(await request.json());
		const recipe = await updateRecipeBaseServingsForPlan({
			planId: params.planId,
			recipeSourceId: params.recipeSourceId,
			servings: body.servings,
			userId: actor.userId,
		});

		after(async () => {
			await syncAdjustedRecipeForPlan({
				planId: params.planId,
				recipeSourceId: params.recipeSourceId,
			});
		});

		return Response.json({ recipe });
	} catch (error) {
		const { message, shouldLog, status } = getPatchRecipeErrorResponse(error);

		if (shouldLog) {
			console.error(error);
		}

		return Response.json({ message }, { status });
	}
}

export async function DELETE(
	request: Request,
	context: { params: Promise<{ planId: string; recipeSourceId: string }> },
) {
	const invalidOriginResponse = getInvalidOriginResponse(request);

	if (invalidOriginResponse) {
		return invalidOriginResponse;
	}

	const cookieStore = await cookies();
	const actor = await getRequestActor(cookieStore);

	if (!actor) {
		return Response.json({ message: 'Unauthorized.' }, { status: 401 });
	}

	try {
		const params = routeParamsSchema.parse(await context.params);

		await deleteRecipeSourceFromPlan({
			planId: params.planId,
			recipeSourceId: params.recipeSourceId,
			userId: actor.userId,
		});

		return new Response(null, { status: 204 });
	} catch (error) {
		const { message, shouldLog, status } = getDeleteRecipeErrorResponse(error);

		if (shouldLog) {
			console.error(error);
		}

		return Response.json({ message }, { status });
	}
}
