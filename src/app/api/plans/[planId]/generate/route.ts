import { cookies } from 'next/headers';
import { z } from 'zod';
import { generateCookingPlan } from '@/lib/ai/planner';
import { getRequestActor } from '@/lib/create-session';
import { buildPlanGenerationInput, saveGeneratedPlanVersion } from '@/lib/plans/queries';
import { planGenerationOptionsSchema } from '@/lib/plans/schema';

const routeParamsSchema = z.object({
	planId: z.string().uuid(),
});

const getErrorResponse = (error: unknown): { message: string; status: number } => {
	if (error instanceof z.ZodError) {
		return { message: error.issues[0]?.message ?? 'Invalid generation request.', status: 400 };
	}

	if (error instanceof Error) {
		if (error.message === 'Plan not found.') {
			return { message: error.message, status: 404 };
		}

		if (
			error.message === 'Archived plans cannot be generated.' ||
			error.message === 'At least one structured recipe is required.' ||
			error.message === 'All recipes must be processed before generating a plan.'
		) {
			return { message: error.message, status: 400 };
		}

		return { message: error.message || 'Failed to generate plan.', status: 500 };
	}

	return { message: 'Failed to generate plan.', status: 500 };
};

export async function POST(request: Request, context: { params: Promise<{ planId: string }> }) {
	const cookieStore = await cookies();
	const actor = await getRequestActor(cookieStore);

	if (!actor) {
		return Response.json({ message: 'Unauthorized.' }, { status: 401 });
	}

	try {
		const params = routeParamsSchema.parse(await context.params);
		const options = planGenerationOptionsSchema.parse(await request.json());
		const plannerInput = await buildPlanGenerationInput({
			options,
			planId: params.planId,
			userId: actor.userId,
		});
		const planDocument = await generateCookingPlan(plannerInput);
		const activeVersion = await saveGeneratedPlanVersion({
			planDocument,
			planId: params.planId,
			requestedServings: options.requestedServings,
			userId: actor.userId,
		});

		return Response.json({
			plan: activeVersion.plan,
			version: {
				createdAt: activeVersion.createdAt,
				id: activeVersion.id,
				versionNumber: activeVersion.versionNumber,
			},
		});
	} catch (error) {
		const { message, status } = getErrorResponse(error);

		if (status >= 500) {
			console.error(error);
		}

		return Response.json({ message }, { status });
	}
}
