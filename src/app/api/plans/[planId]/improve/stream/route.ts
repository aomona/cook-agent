import { cookies } from 'next/headers';
import { z } from 'zod';
import { type PlannerStreamEvent, streamImproveCookingPlan } from '@/lib/ai/planner';
import { getRequestActor } from '@/lib/create-session';
import { buildPlanGenerationInput, saveGeneratedPlanVersion } from '@/lib/plans/queries';
import { planDocumentSchema, planGenerationOptionsSchema } from '@/lib/plans/schema';
import {
	createSseResponse,
	getPlannerRouteErrorResponse,
	plannerRouteMaxDuration,
	plannerRouteRuntime,
	writeSseEvent,
} from '@/lib/plans/stream-route';

const routeParamsSchema = z.object({
	planId: z.string().uuid(),
});

const improvePlanRequestSchema = planGenerationOptionsSchema.extend({
	currentPlan: planDocumentSchema,
	improvementRequest: z.string().trim().min(1).max(2000),
});

export const runtime = plannerRouteRuntime;
export const maxDuration = plannerRouteMaxDuration;

export async function POST(request: Request, context: { params: Promise<{ planId: string }> }) {
	const cookieStore = await cookies();
	const actor = await getRequestActor(cookieStore);

	if (!actor) {
		return Response.json({ message: 'Unauthorized.' }, { status: 401 });
	}

	try {
		const params = routeParamsSchema.parse(await context.params);
		const payload = improvePlanRequestSchema.parse(await request.json());
		const plannerInput = await buildPlanGenerationInput({
			options: payload,
			planId: params.planId,
			userId: actor.userId,
		});
		const stream = new TransformStream<Uint8Array, Uint8Array>();
		const writer = stream.writable.getWriter();

		void (async () => {
			try {
				await writeSseEvent(writer, 'status', {
					message: 'AI が工程の改善案を作成しています。',
				});

				const planDocument = await streamImproveCookingPlan({
					abortSignal: request.signal,
					input: {
						currentPlan: payload.currentPlan,
						improvementRequest: payload.improvementRequest,
						plannerInput,
					},
					onEvent: async (event: PlannerStreamEvent) => {
						await writeSseEvent(writer, event.type, event);
					},
				});

				const activeVersion = await saveGeneratedPlanVersion({
					changeSummary: `改善: ${payload.improvementRequest.slice(0, 120)}`,
					planDocument,
					planId: params.planId,
					requestedServings: payload.requestedServings,
					userId: actor.userId,
				});

				await writeSseEvent(writer, 'result', {
					plan: activeVersion.plan,
					version: {
						createdAt: activeVersion.createdAt,
						id: activeVersion.id,
						versionNumber: activeVersion.versionNumber,
					},
				});
			} catch (error) {
				const { message } = getPlannerRouteErrorResponse(error, 'Failed to improve plan.');
				await writeSseEvent(writer, 'error', { message });
			} finally {
				await writer.close();
			}
		})();

		return createSseResponse(stream.readable);
	} catch (error) {
		const { message, status } = getPlannerRouteErrorResponse(error, 'Failed to improve plan.');

		if (status >= 500) {
			console.error(error);
		}

		return Response.json({ message }, { status });
	}
}
