import { cookies } from 'next/headers';
import { z } from 'zod';
import { type PlannerStreamEvent, streamCookingPlan } from '@/lib/ai/planner';
import { getRequestActor } from '@/lib/create-session';
import { buildPlanGenerationInput, saveGeneratedPlanVersion } from '@/lib/plans/queries';
import { planGenerationOptionsSchema } from '@/lib/plans/schema';

const routeParamsSchema = z.object({
	planId: z.string().uuid(),
});

const encoder = new TextEncoder();

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

const writeEvent = async (
	writer: WritableStreamDefaultWriter<Uint8Array>,
	event: string,
	data: Record<string, unknown>,
): Promise<void> => {
	await writer.write(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
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
		const stream = new TransformStream<Uint8Array, Uint8Array>();
		const writer = stream.writable.getWriter();

		void (async () => {
			try {
				await writeEvent(writer, 'status', {
					message: 'AI が工程を構成しています。',
				});

				const planDocument = await streamCookingPlan({
					abortSignal: request.signal,
					input: plannerInput,
					onEvent: async (event: PlannerStreamEvent) => {
						await writeEvent(writer, event.type, event);
					},
				});

				const activeVersion = await saveGeneratedPlanVersion({
					planDocument,
					planId: params.planId,
					requestedServings: options.requestedServings,
					userId: actor.userId,
				});

				await writeEvent(writer, 'result', {
					plan: activeVersion.plan,
					version: {
						createdAt: activeVersion.createdAt,
						id: activeVersion.id,
						versionNumber: activeVersion.versionNumber,
					},
				});
			} catch (error) {
				const { message } = getErrorResponse(error);
				await writeEvent(writer, 'error', { message });
			} finally {
				await writer.close();
			}
		})();

		return new Response(stream.readable, {
			headers: {
				'Cache-Control': 'no-cache, no-transform',
				Connection: 'keep-alive',
				'Content-Type': 'text/event-stream; charset=utf-8',
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
