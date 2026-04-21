import { cookies } from 'next/headers';
import { z } from 'zod';
import { type PlannerStreamEvent, streamCookingPlan } from '@/lib/ai/planner';
import { getRequestActor } from '@/lib/create-session';
import { getInvalidOriginResponse } from '@/lib/network/same-origin';
import { buildPlanGenerationInput, saveGeneratedPlanVersion } from '@/lib/plans/queries';
import { planGenerationOptionsSchema } from '@/lib/plans/schema';
import {
	createSseResponse,
	getPlannerRouteErrorResponse,
	writeSseEvent,
} from '@/lib/plans/stream-route';

const routeParamsSchema = z.object({
	planId: z.uuid(),
});

export const runtime = 'nodejs';
export const maxDuration = 180;

export async function POST(request: Request, context: { params: Promise<{ planId: string }> }) {
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
		const options = planGenerationOptionsSchema.parse(await request.json());
		const plannerInput = await buildPlanGenerationInput({
			options,
			planId: params.planId,
			userId: actor.userId,
		});
		const stream = new TransformStream<Uint8Array, Uint8Array>();
		const writer = stream.writable.getWriter();

		void (async () => {
			try {
				await writeSseEvent(writer, 'status', {
					message: 'AI が工程を構成しています。',
				});

				const planDocument = await streamCookingPlan({
					abortSignal: request.signal,
					input: plannerInput,
					onEvent: async (event: PlannerStreamEvent) => {
						await writeSseEvent(writer, event.type, event);
					},
				});

				const activeVersion = await saveGeneratedPlanVersion({
					planDocument,
					planId: params.planId,
					requestedServings: options.requestedServings,
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
				const { message } = getPlannerRouteErrorResponse(error, 'Failed to generate plan.');
				await writeSseEvent(writer, 'error', { message });
			} finally {
				await writer.close();
			}
		})();

		return createSseResponse(stream.readable);
	} catch (error) {
		const { message, status } = getPlannerRouteErrorResponse(error, 'Failed to generate plan.');

		if (status >= 500) {
			console.error(error);
		}

		return Response.json({ message }, { status });
	}
}
