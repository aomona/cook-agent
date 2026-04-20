import { cookies } from 'next/headers';
import { z } from 'zod';
import {
	cancelSessionTimer,
	completeCurrentCookingStep,
	moveCookingSessionToStep,
	pauseCookingSession,
	pauseSessionTimer,
	reportSessionDelay,
	reportSessionIngredientShortage,
	reportSessionMistake,
	requestRuntimeReplan,
	resumeCookingSession,
	resumeSessionTimer,
	startSessionTimer,
} from '@/lib/cook-runtime/actions';
import { getRequestActor } from '@/lib/create-session';

const routeParamsSchema = z.object({
	sessionId: z.uuid(),
});

const actionSchema = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('pause_session'),
	}),
	z.object({
		type: z.literal('resume_session'),
	}),
	z.object({
		type: z.literal('complete_step'),
	}),
	z.object({
		type: z.literal('move_to_step'),
		stepId: z.string().trim().min(1).max(120),
	}),
	z.object({
		type: z.literal('start_timer'),
		stepId: z.string().trim().min(1).max(120),
		timerId: z.string().trim().min(1).max(120),
	}),
	z.object({
		type: z.literal('pause_timer'),
		timerRowId: z.uuid(),
	}),
	z.object({
		type: z.literal('resume_timer'),
		timerRowId: z.uuid(),
	}),
	z.object({
		type: z.literal('cancel_timer'),
		timerRowId: z.uuid(),
	}),
	z.object({
		type: z.literal('report_delay'),
		stepId: z.string().trim().min(1).max(120),
		delayMinutes: z.number().int().min(1).max(240),
		message: z.string().trim().min(1).max(500).optional(),
	}),
	z.object({
		type: z.literal('report_mistake'),
		stepId: z.string().trim().min(1).max(120),
		message: z.string().trim().min(1).max(500),
	}),
	z.object({
		type: z.literal('report_ingredient_shortage'),
		stepId: z.string().trim().min(1).max(120).optional(),
		ingredientName: z.string().trim().min(1).max(120),
		message: z.string().trim().min(1).max(500).optional(),
		replacementOptions: z.array(z.string().trim().min(1).max(120)).max(8).optional(),
	}),
	z.object({
		type: z.literal('request_replan'),
		stepId: z.string().trim().min(1).max(120).optional(),
		message: z.string().trim().min(1).max(500),
	}),
]);

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
	const actor = await getRequestActor(await cookies());

	if (!actor) {
		return Response.json({ message: 'Unauthorized.' }, { status: 401 });
	}

	try {
		const params = routeParamsSchema.parse(await context.params);
		const action = actionSchema.parse(await request.json());

		const snapshot =
			action.type === 'pause_session'
				? await pauseCookingSession({ sessionId: params.sessionId, userId: actor.userId })
				: action.type === 'resume_session'
					? await resumeCookingSession({ sessionId: params.sessionId, userId: actor.userId })
					: action.type === 'complete_step'
						? await completeCurrentCookingStep({
								sessionId: params.sessionId,
								userId: actor.userId,
							})
						: action.type === 'move_to_step'
							? await moveCookingSessionToStep({
									sessionId: params.sessionId,
									stepId: action.stepId,
									userId: actor.userId,
								})
							: action.type === 'start_timer'
								? await startSessionTimer({
										sessionId: params.sessionId,
										stepId: action.stepId,
										timerId: action.timerId,
										userId: actor.userId,
									})
								: action.type === 'pause_timer'
									? await pauseSessionTimer({
											sessionId: params.sessionId,
											timerRowId: action.timerRowId,
											userId: actor.userId,
										})
									: action.type === 'resume_timer'
										? await resumeSessionTimer({
												sessionId: params.sessionId,
												timerRowId: action.timerRowId,
												userId: actor.userId,
											})
										: action.type === 'cancel_timer'
											? await cancelSessionTimer({
													sessionId: params.sessionId,
													timerRowId: action.timerRowId,
													userId: actor.userId,
												})
											: action.type === 'report_delay'
												? await reportSessionDelay({
														delayMinutes: action.delayMinutes,
														message: action.message,
														sessionId: params.sessionId,
														stepId: action.stepId,
														userId: actor.userId,
													})
												: action.type === 'report_mistake'
													? await reportSessionMistake({
															message: action.message,
															sessionId: params.sessionId,
															stepId: action.stepId,
															userId: actor.userId,
														})
													: action.type === 'report_ingredient_shortage'
														? await reportSessionIngredientShortage({
																ingredientName: action.ingredientName,
																message: action.message,
																replacementOptions: action.replacementOptions,
																sessionId: params.sessionId,
																stepId: action.stepId,
																userId: actor.userId,
															})
														: await requestRuntimeReplan({
																message: action.message,
																sessionId: params.sessionId,
																stepId: action.stepId,
																userId: actor.userId,
															});

		return Response.json({ snapshot });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to update cooking session.';

		return Response.json({ message }, { status: 400 });
	}
}
