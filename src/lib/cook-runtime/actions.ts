import 'server-only';

import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import { cookingSessions, plans, planVersions, sessionEvents, sessionTimers } from '@/db/schema';
import { improveCookingPlan } from '@/lib/ai/planner';
import { buildPlanGenerationInput, saveGeneratedPlanVersion } from '@/lib/plans/queries';
import { planDocumentSchema } from '@/lib/plans/schema';
import type {
	PlanDocument,
	PlanPatch,
	PlanTimer,
	SessionEventPayloadByType,
	SessionEventType,
} from '@/lib/plans/types';
import { parseUuid } from '@/lib/uuid';
import { getOwnedCookSessionSnapshotBySessionId } from './queries';

const activeSessionStatuses = ['active', 'paused'] as const;

const getOwnedSessionRecord = async ({
	sessionId,
	userId,
	allowedStatuses,
}: {
	sessionId: string;
	userId: string;
	allowedStatuses?: readonly string[];
}) => {
	const validSessionId = parseUuid(sessionId);

	if (!validSessionId) {
		return null;
	}

	const [session] = await db
		.select()
		.from(cookingSessions)
		.where(and(eq(cookingSessions.id, validSessionId), eq(cookingSessions.userId, userId)));

	if (!session) {
		return null;
	}

	if (allowedStatuses && !allowedStatuses.includes(session.status)) {
		throw new Error('Cooking session is not in an allowed state.');
	}

	return session;
};

const getPlanDocumentForSession = async ({
	planId,
	planVersionId,
	userId,
}: {
	planId: string;
	planVersionId: string;
	userId: string;
}): Promise<PlanDocument> => {
	const [version] = await db
		.select({
			planJson: planVersions.planJson,
		})
		.from(planVersions)
		.innerJoin(plans, eq(planVersions.planId, plans.id))
		.where(
			and(
				eq(planVersions.id, planVersionId),
				eq(planVersions.planId, planId),
				eq(plans.userId, userId),
			),
		);

	if (!version) {
		throw new Error('Cooking session not found.');
	}

	return planDocumentSchema.parse(version.planJson);
};

const createSessionEvent = async <TType extends SessionEventType>({
	eventType,
	payload,
	sessionId,
	stepId,
}: {
	sessionId: string;
	eventType: TType;
	payload: SessionEventPayloadByType[TType];
	stepId?: string | null;
}) => {
	await db.insert(sessionEvents).values({
		sessionId,
		eventType,
		stepId: stepId ?? payload.stepId ?? null,
		payload,
	});
};

const getStepAndTimer = ({
	plan,
	stepId,
	timerId,
}: {
	plan: PlanDocument;
	stepId: string;
	timerId: string;
}): { step: PlanDocument['steps'][number]; timer: PlanTimer } | null => {
	const step = plan.steps.find((candidate) => candidate.id === stepId);
	const timer = step?.timers?.find((candidate) => candidate.id === timerId);

	if (!step || !timer) {
		return null;
	}

	return { step, timer };
};

export const startCookingSession = async ({
	planId,
	userId,
}: {
	planId: string;
	userId: string;
}) => {
	const validPlanId = parseUuid(planId);

	if (!validPlanId) {
		throw new Error('Plan not found.');
	}

	const [existingSession] = await db
		.select({ id: cookingSessions.id })
		.from(cookingSessions)
		.where(
			and(
				eq(cookingSessions.planId, validPlanId),
				eq(cookingSessions.userId, userId),
				inArray(cookingSessions.status, [...activeSessionStatuses]),
			),
		)
		.orderBy(desc(cookingSessions.updatedAt))
		.limit(1);

	if (existingSession) {
		const snapshot = await getOwnedCookSessionSnapshotBySessionId(existingSession.id, userId);

		if (!snapshot) {
			throw new Error('Cooking session not found.');
		}

		return snapshot;
	}

	const [plan] = await db
		.select({
			id: plans.id,
			activeVersionId: plans.activeVersionId,
		})
		.from(plans)
		.where(and(eq(plans.id, validPlanId), eq(plans.userId, userId)));

	if (!plan?.activeVersionId) {
		throw new Error('Active plan not found.');
	}

	const planDocument = await getPlanDocumentForSession({
		planId: plan.id,
		planVersionId: plan.activeVersionId,
		userId,
	});
	const firstStep = planDocument.steps[0] ?? null;

	let sessionId: string;

	try {
		const [session] = await db
			.insert(cookingSessions)
			.values({
				planId: plan.id,
				planVersionId: plan.activeVersionId,
				userId,
				status: 'active',
				generationStatus: 'ready',
				kitchenConstraints: planDocument.metadata?.constraints ?? [],
				currentStepId: firstStep?.id ?? null,
				startedAt: new Date(),
			})
			.returning({ id: cookingSessions.id });

		if (!session) {
			throw new Error('Failed to start cooking session.');
		}

		sessionId = session.id;

		await createSessionEvent({
			eventType: 'progress',
			payload: {
				message: firstStep
					? `調理を開始しました。現在は「${firstStep.label}」です。`
					: '調理を開始しました。',
				status: 'started',
				stepId: firstStep?.id ?? '',
			},
			stepId: firstStep?.id,
			sessionId: session.id,
		});
	} catch (error) {
		// If unique constraint violation, return existing active session
		if (
			error instanceof Error &&
			error.message.includes('cooking_sessions_plan_user_active_unique')
		) {
			const [existing] = await db
				.select({ id: cookingSessions.id })
				.from(cookingSessions)
				.where(
					and(
						eq(cookingSessions.planId, validPlanId),
						eq(cookingSessions.userId, userId),
						inArray(cookingSessions.status, [...activeSessionStatuses]),
					),
				)
				.orderBy(desc(cookingSessions.updatedAt))
				.limit(1);

			if (existing) {
				sessionId = existing.id;
			} else {
				throw error;
			}
		} else {
			throw error;
		}
	}

	const snapshot = await getOwnedCookSessionSnapshotBySessionId(sessionId, userId);

	if (!snapshot) {
		throw new Error('Failed to load cooking session.');
	}

	return snapshot;
};

export const pauseCookingSession = async ({
	sessionId,
	userId,
}: {
	sessionId: string;
	userId: string;
}) => {
	const session = await getOwnedSessionRecord({
		sessionId,
		userId,
		allowedStatuses: activeSessionStatuses,
	});

	if (!session) {
		throw new Error('Cooking session not found.');
	}

	await db
		.update(cookingSessions)
		.set({
			status: 'paused',
		})
		.where(eq(cookingSessions.id, session.id));

	await createSessionEvent({
		eventType: 'user_request',
		payload: {
			message: '調理を一時停止しました。',
			requestedChange: 'pause_session',
			stepId: session.currentStepId ?? undefined,
		},
		sessionId: session.id,
	});

	return getOwnedCookSessionSnapshotBySessionId(session.id, userId);
};

export const resumeCookingSession = async ({
	sessionId,
	userId,
}: {
	sessionId: string;
	userId: string;
}) => {
	const session = await getOwnedSessionRecord({
		sessionId,
		userId,
		allowedStatuses: activeSessionStatuses,
	});

	if (!session) {
		throw new Error('Cooking session not found.');
	}

	await db
		.update(cookingSessions)
		.set({
			status: 'active',
		})
		.where(eq(cookingSessions.id, session.id));

	await createSessionEvent({
		eventType: 'user_request',
		payload: {
			message: '調理を再開しました。',
			requestedChange: 'resume_session',
			stepId: session.currentStepId ?? undefined,
		},
		sessionId: session.id,
	});

	return getOwnedCookSessionSnapshotBySessionId(session.id, userId);
};

export const moveCookingSessionToStep = async ({
	sessionId,
	stepId,
	userId,
}: {
	sessionId: string;
	stepId: string;
	userId: string;
}) => {
	const session = await getOwnedSessionRecord({
		sessionId,
		userId,
		allowedStatuses: activeSessionStatuses,
	});

	if (!session) {
		throw new Error('Cooking session not found.');
	}

	const plan = await getPlanDocumentForSession({
		planId: session.planId,
		planVersionId: session.planVersionId,
		userId,
	});
	const step = plan.steps.find((candidate) => candidate.id === stepId);

	if (!step) {
		throw new Error('Step not found.');
	}

	await db
		.update(cookingSessions)
		.set({
			currentStepId: step.id,
			status: 'active',
			completedAt: null,
		})
		.where(eq(cookingSessions.id, session.id));

	await createSessionEvent({
		eventType: 'progress',
		payload: {
			message: `現在の手順を「${step.label}」に切り替えました。`,
			status: 'started',
			stepId: step.id,
		},
		sessionId: session.id,
		stepId: step.id,
	});

	return getOwnedCookSessionSnapshotBySessionId(session.id, userId);
};

export const completeCurrentCookingStep = async ({
	sessionId,
	userId,
}: {
	sessionId: string;
	userId: string;
}) => {
	const session = await getOwnedSessionRecord({
		sessionId,
		userId,
		allowedStatuses: activeSessionStatuses,
	});

	if (!session) {
		throw new Error('Cooking session not found.');
	}

	const plan = await getPlanDocumentForSession({
		planId: session.planId,
		planVersionId: session.planVersionId,
		userId,
	});
	const currentIndex = plan.steps.findIndex((step) => step.id === session.currentStepId);
	const currentStep = currentIndex >= 0 ? plan.steps[currentIndex] : null;
	const nextStep = currentIndex >= 0 ? (plan.steps[currentIndex + 1] ?? null) : null;

	// Conditional update to prevent race conditions
	const updateResult = await db
		.update(cookingSessions)
		.set({
			currentStepId: nextStep?.id ?? null,
			status: nextStep ? 'active' : 'completed',
			completedAt: nextStep ? null : new Date(),
		})
		.where(
			and(
				eq(cookingSessions.id, session.id),
				session.currentStepId !== null
					? eq(cookingSessions.currentStepId, session.currentStepId)
					: undefined,
			),
		);

	// Check if update succeeded (step was still current)
	if (!updateResult.rowCount || updateResult.rowCount === 0) {
		// Step was already completed by concurrent request, no-op
		return getOwnedCookSessionSnapshotBySessionId(session.id, userId);
	}

	await createSessionEvent({
		eventType: 'progress',
		payload: {
			message: currentStep
				? `「${currentStep.label}」を完了しました。`
				: '現在の手順を完了しました。',
			status: 'completed',
			stepId: currentStep?.id ?? '',
		},
		sessionId: session.id,
		stepId: currentStep?.id,
	});

	if (nextStep) {
		await createSessionEvent({
			eventType: 'progress',
			payload: {
				message: `次は「${nextStep.label}」です。`,
				status: 'started',
				stepId: nextStep.id,
			},
			sessionId: session.id,
			stepId: nextStep.id,
		});
	}

	return getOwnedCookSessionSnapshotBySessionId(session.id, userId);
};

export const startSessionTimer = async ({
	sessionId,
	stepId,
	timerId,
	userId,
}: {
	sessionId: string;
	stepId: string;
	timerId: string;
	userId: string;
}) => {
	const session = await getOwnedSessionRecord({
		sessionId,
		userId,
		allowedStatuses: activeSessionStatuses,
	});

	if (!session) {
		throw new Error('Cooking session not found.');
	}

	const plan = await getPlanDocumentForSession({
		planId: session.planId,
		planVersionId: session.planVersionId,
		userId,
	});
	const stepAndTimer = getStepAndTimer({ plan, stepId, timerId });

	if (!stepAndTimer) {
		throw new Error('Timer not found.');
	}

	// Check if a running timer already exists for this session/step/timer combination
	const [existingTimer] = await db
		.select({ id: sessionTimers.id })
		.from(sessionTimers)
		.where(
			and(
				eq(sessionTimers.sessionId, session.id),
				eq(sessionTimers.stepId, stepAndTimer.step.id),
				eq(sessionTimers.planTimerId, stepAndTimer.timer.id),
				eq(sessionTimers.status, 'running'),
			),
		)
		.limit(1);

	if (existingTimer) {
		// Timer already running, return current snapshot
		return getOwnedCookSessionSnapshotBySessionId(session.id, userId);
	}

	const endsAt = new Date(Date.now() + stepAndTimer.timer.seconds * 1000);

	try {
		await db.insert(sessionTimers).values({
			sessionId: session.id,
			planTimerId: stepAndTimer.timer.id,
			stepId: stepAndTimer.step.id,
			label: stepAndTimer.timer.label,
			durationSeconds: stepAndTimer.timer.seconds,
			pausedRemainingSeconds: null,
			status: 'running',
			startedAt: new Date(),
			endsAt,
		});

		await createSessionEvent({
			eventType: 'timer',
			payload: {
				action: 'started',
				message: `タイマー「${stepAndTimer.timer.label}」を開始しました。`,
				remainingSeconds: stepAndTimer.timer.seconds,
				stepId: stepAndTimer.step.id,
				timerId: stepAndTimer.timer.id,
			},
			sessionId: session.id,
			stepId: stepAndTimer.step.id,
		});
	} catch (error) {
		// If unique constraint violation from concurrent request, just return current snapshot
		if (
			error instanceof Error &&
			error.message.includes('session_timers_session_step_plantimer_running_unique')
		) {
			return getOwnedCookSessionSnapshotBySessionId(session.id, userId);
		}
		throw error;
	}

	return getOwnedCookSessionSnapshotBySessionId(session.id, userId);
};

const updateSessionTimerStatus = async ({
	action,
	sessionId,
	timerRowId,
	userId,
}: {
	action: 'paused' | 'resumed' | 'cancelled';
	sessionId: string;
	timerRowId: string;
	userId: string;
}) => {
	const session = await getOwnedSessionRecord({
		sessionId,
		userId,
		allowedStatuses: activeSessionStatuses,
	});

	if (!session) {
		throw new Error('Cooking session not found.');
	}

	const validTimerRowId = parseUuid(timerRowId);

	if (!validTimerRowId) {
		throw new Error('Timer not found.');
	}

	const [timer] = await db
		.select()
		.from(sessionTimers)
		.where(and(eq(sessionTimers.id, validTimerRowId), eq(sessionTimers.sessionId, session.id)));

	if (!timer) {
		throw new Error('Timer not found.');
	}

	if (action === 'paused') {
		// Only allow pause when timer is running
		if (timer.status !== 'running') {
			throw new Error('Timer must be running to pause.');
		}

		const remainingSeconds = timer.endsAt
			? Math.max(0, Math.ceil((timer.endsAt.getTime() - Date.now()) / 1000))
			: (timer.pausedRemainingSeconds ?? timer.durationSeconds);

		const updateResult = await db
			.update(sessionTimers)
			.set({
				status: 'paused',
				pausedRemainingSeconds: remainingSeconds,
				endsAt: null,
			})
			.where(and(eq(sessionTimers.id, timer.id), eq(sessionTimers.status, 'running')));

		if (!updateResult.rowCount || updateResult.rowCount === 0) {
			throw new Error('Timer is no longer running.');
		}

		await createSessionEvent({
			eventType: 'timer',
			payload: {
				action: 'paused',
				message: `タイマー「${timer.label}」を一時停止しました。`,
				remainingSeconds,
				stepId: timer.stepId,
				timerId: timer.planTimerId,
			},
			sessionId: session.id,
			stepId: timer.stepId,
		});
	} else if (action === 'resumed') {
		// Only allow resume when timer is paused
		if (timer.status !== 'paused') {
			throw new Error('Timer must be paused to resume.');
		}

		const remainingSeconds = timer.pausedRemainingSeconds ?? timer.durationSeconds;

		const updateResult = await db
			.update(sessionTimers)
			.set({
				status: 'running',
				pausedRemainingSeconds: null,
				endsAt: new Date(Date.now() + remainingSeconds * 1000),
			})
			.where(and(eq(sessionTimers.id, timer.id), eq(sessionTimers.status, 'paused')));

		if (!updateResult.rowCount || updateResult.rowCount === 0) {
			throw new Error('Timer is no longer paused.');
		}

		await createSessionEvent({
			eventType: 'timer',
			payload: {
				action: 'resumed',
				message: `タイマー「${timer.label}」を再開しました。`,
				remainingSeconds,
				stepId: timer.stepId,
				timerId: timer.planTimerId,
			},
			sessionId: session.id,
			stepId: timer.stepId,
		});
	} else {
		// Only allow cancel when timer is not already cancelled
		if (timer.status === 'cancelled') {
			throw new Error('Timer is already cancelled.');
		}

		const updateResult = await db
			.update(sessionTimers)
			.set({
				status: 'cancelled',
				endsAt: null,
			})
			.where(
				and(
					eq(sessionTimers.id, timer.id),
					// Ensure timer is not already cancelled
					sql`${sessionTimers.status} != 'cancelled'`,
				),
			);

		if (!updateResult.rowCount || updateResult.rowCount === 0) {
			throw new Error('Timer is already cancelled.');
		}

		await createSessionEvent({
			eventType: 'timer',
			payload: {
				action: 'cancelled',
				message: `タイマー「${timer.label}」をキャンセルしました。`,
				stepId: timer.stepId,
				timerId: timer.planTimerId,
			},
			sessionId: session.id,
			stepId: timer.stepId,
		});
	}

	return getOwnedCookSessionSnapshotBySessionId(session.id, userId);
};

export const pauseSessionTimer = (input: {
	sessionId: string;
	timerRowId: string;
	userId: string;
}) => updateSessionTimerStatus({ ...input, action: 'paused' });

export const resumeSessionTimer = (input: {
	sessionId: string;
	timerRowId: string;
	userId: string;
}) => updateSessionTimerStatus({ ...input, action: 'resumed' });

export const cancelSessionTimer = (input: {
	sessionId: string;
	timerRowId: string;
	userId: string;
}) => updateSessionTimerStatus({ ...input, action: 'cancelled' });

export const reportSessionDelay = async ({
	delayMinutes,
	message,
	sessionId,
	stepId,
	userId,
}: {
	sessionId: string;
	stepId: string;
	delayMinutes: number;
	message?: string;
	userId: string;
}) => {
	const session = await getOwnedSessionRecord({
		sessionId,
		userId,
		allowedStatuses: activeSessionStatuses,
	});

	if (!session) {
		throw new Error('Cooking session not found.');
	}

	await createSessionEvent({
		eventType: 'delay',
		payload: {
			delayMinutes,
			message: message ?? `進行が ${delayMinutes} 分遅れています。`,
			stepId,
		},
		sessionId: session.id,
		stepId,
	});

	return getOwnedCookSessionSnapshotBySessionId(session.id, userId);
};

export const reportSessionMistake = async ({
	message,
	sessionId,
	stepId,
	userId,
}: {
	sessionId: string;
	stepId: string;
	message: string;
	userId: string;
}) => {
	const session = await getOwnedSessionRecord({
		sessionId,
		userId,
		allowedStatuses: activeSessionStatuses,
	});

	if (!session) {
		throw new Error('Cooking session not found.');
	}

	await createSessionEvent({
		eventType: 'mistake',
		payload: {
			message,
			stepId,
		},
		sessionId: session.id,
		stepId,
	});

	return getOwnedCookSessionSnapshotBySessionId(session.id, userId);
};

export const reportSessionIngredientShortage = async ({
	ingredientName,
	message,
	replacementOptions,
	sessionId,
	stepId,
	userId,
}: {
	sessionId: string;
	stepId?: string;
	ingredientName: string;
	replacementOptions?: string[];
	message?: string;
	userId: string;
}) => {
	const session = await getOwnedSessionRecord({
		sessionId,
		userId,
		allowedStatuses: activeSessionStatuses,
	});

	if (!session) {
		throw new Error('Cooking session not found.');
	}

	await createSessionEvent({
		eventType: 'ingredient_shortage',
		payload: {
			ingredientName,
			message: message ?? `${ingredientName} が不足しています。`,
			replacementOptions,
			stepId,
		},
		sessionId: session.id,
		stepId,
	});

	return getOwnedCookSessionSnapshotBySessionId(session.id, userId);
};

export const requestRuntimeReplan = async ({
	message,
	sessionId,
	stepId,
	userId,
}: {
	sessionId: string;
	stepId?: string;
	message: string;
	userId: string;
}) => {
	const session = await getOwnedSessionRecord({
		sessionId,
		userId,
		allowedStatuses: activeSessionStatuses,
	});

	if (!session) {
		throw new Error('Cooking session not found.');
	}

	const snapshot = await getOwnedCookSessionSnapshotBySessionId(session.id, userId);

	if (!snapshot) {
		throw new Error('Cooking session not found.');
	}

	const plannerInput = await buildPlanGenerationInput({
		options: {
			requestedServings: snapshot.plan.requestedServings ?? snapshot.plan.document.servings,
			availableEquipment: snapshot.plan.document.metadata?.availableEquipment ?? [],
			constraints: snapshot.plan.document.metadata?.constraints ?? [],
		},
		planId: session.planId,
		userId,
	});
	const nextPlanDocument = await improveCookingPlan({
		currentPlan: snapshot.plan.document,
		improvementRequest: message,
		plannerInput: {
			...plannerInput,
			availableEquipment:
				snapshot.plan.document.metadata?.availableEquipment ?? plannerInput.availableEquipment,
			constraints: snapshot.plan.document.metadata?.constraints ?? plannerInput.constraints,
			planningSettings:
				snapshot.plan.document.metadata?.planningSettings ?? plannerInput.planningSettings,
		},
	});
	const activeVersion = await saveGeneratedPlanVersion({
		changeReason: 'runtime_replan',
		changeSummary: `Runtime replan: ${message.slice(0, 120)}`,
		planDocument: nextPlanDocument,
		planId: session.planId,
		requestedServings: snapshot.plan.requestedServings ?? nextPlanDocument.servings,
		userId,
	});
	const nextCurrentStepId = nextPlanDocument.steps.some(
		(planStep) => planStep.id === session.currentStepId,
	)
		? session.currentStepId
		: (nextPlanDocument.steps[0]?.id ?? null);
	const patch: PlanPatch = {
		baseVersionNumber: snapshot.plan.versionNumber,
		operations: [],
		summary: message,
	};

	await db
		.update(cookingSessions)
		.set({
			currentStepId: nextCurrentStepId,
			planVersionId: activeVersion.id,
		})
		.where(eq(cookingSessions.id, session.id));

	await createSessionEvent({
		eventType: 'replan_applied',
		payload: {
			appliedPatch: patch,
			message: `runtime replan を適用しました: ${message}`,
			stepId,
		},
		sessionId: session.id,
		stepId,
	});

	return getOwnedCookSessionSnapshotBySessionId(session.id, userId);
};
