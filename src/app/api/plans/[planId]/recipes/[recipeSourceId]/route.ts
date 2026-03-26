import { cookies } from 'next/headers';
import { z } from 'zod';
import { deleteRecipeSourceFromPlan, getRequestActor } from '@/lib/create-session';

const routeParamsSchema = z.object({
	planId: z.string().uuid(),
	recipeSourceId: z.string().uuid(),
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

export async function DELETE(
	_request: Request,
	context: { params: Promise<{ planId: string; recipeSourceId: string }> },
) {
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
