import { cookies } from 'next/headers';
import { z } from 'zod';
import { deleteRecipeSourceFromPlan, getRequestActor } from '@/lib/create-session';

const routeParamsSchema = z.object({
	planId: z.string().uuid(),
	recipeSourceId: z.string().uuid(),
});

const getErrorMessage = (error: unknown): string => {
	if (error instanceof Error && error.message) {
		return error.message;
	}

	return 'Failed to delete recipe.';
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
		if (error instanceof z.ZodError) {
			return Response.json({ message: 'Invalid recipe identifier.' }, { status: 400 });
		}

		const message = getErrorMessage(error);
		const status = message === 'Recipe not found.' || message === 'Plan not found.' ? 404 : 400;

		return Response.json({ message }, { status });
	}
}
