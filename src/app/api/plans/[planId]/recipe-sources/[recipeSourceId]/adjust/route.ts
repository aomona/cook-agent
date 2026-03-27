import { and, eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { after } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { planRecipeSources, plans } from '@/db/schema';
import { getRequestActor } from '@/lib/create-session';
import { syncAdjustedRecipeForPlan } from '@/lib/recipes/adjust-plan-recipes';

const routeParamsSchema = z.object({
	planId: z.uuid(),
	recipeSourceId: z.uuid(),
});

export const runtime = 'nodejs';

export async function POST(
	_request: Request,
	context: { params: Promise<{ planId: string; recipeSourceId: string }> },
) {
	const cookieStore = await cookies();
	const actor = await getRequestActor(cookieStore);

	if (!actor) {
		return Response.json({ message: 'Unauthorized.' }, { status: 401 });
	}

	const params = routeParamsSchema.safeParse(await context.params);

	if (!params.success) {
		return Response.json({ message: 'Recipe source not found.' }, { status: 404 });
	}

	const [planRecipeSource] = await db
		.select({
			adjustmentStatus: planRecipeSources.adjustmentStatus,
			planId: planRecipeSources.planId,
			recipeSourceId: planRecipeSources.recipeSourceId,
		})
		.from(planRecipeSources)
		.innerJoin(plans, eq(planRecipeSources.planId, plans.id))
		.where(
			and(
				eq(planRecipeSources.planId, params.data.planId),
				eq(planRecipeSources.recipeSourceId, params.data.recipeSourceId),
				eq(plans.userId, actor.userId),
				eq(plans.status, 'draft'),
			),
		);

	if (!planRecipeSource) {
		return Response.json({ message: 'Recipe source not found.' }, { status: 404 });
	}

	if (planRecipeSource.adjustmentStatus === 'adjusting') {
		return Response.json({ status: 'adjusting' }, { status: 200 });
	}

	after(async () => {
		await syncAdjustedRecipeForPlan({
			planId: params.data.planId,
			recipeSourceId: params.data.recipeSourceId,
		});
	});

	return Response.json({ status: 'queued' }, { status: 202 });
}
