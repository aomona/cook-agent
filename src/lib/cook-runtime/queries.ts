import 'server-only';

import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { cookingSessions, plans, planVersions, sessionEvents, sessionTimers } from '@/db/schema';
import { planDocumentSchema } from '@/lib/plans/schema';
import type {
	PlanDocument,
	PlanStep,
	SessionEventPayloadByType,
	SessionEventType,
} from '@/lib/plans/types';
import { parseUuid } from '@/lib/uuid';
import type {
	CookSessionEventSummary,
	CookSessionSnapshot,
	CookSessionStatus,
	CookSessionTimerSnapshot,
} from './types';

const activeSessionStatuses = ['active', 'paused'] as const satisfies CookSessionStatus[];

const getDefaultCurrentStep = (plan: PlanDocument): PlanStep | null => plan.steps[0] ?? null;

const getStepById = (plan: PlanDocument, stepId: string | null): PlanStep | null => {
	if (!stepId) {
		return getDefaultCurrentStep(plan);
	}

	return plan.steps.find((step) => step.id === stepId) ?? getDefaultCurrentStep(plan);
};

const getNextStep = (plan: PlanDocument, currentStep: PlanStep | null): PlanStep | null => {
	if (!currentStep) {
		return null;
	}

	const currentIndex = plan.steps.findIndex((step) => step.id === currentStep.id);

	if (currentIndex < 0) {
		return null;
	}

	return plan.steps[currentIndex + 1] ?? null;
};

const getUpcomingSteps = (plan: PlanDocument, currentStep: PlanStep | null): PlanStep[] => {
	if (!currentStep) {
		return plan.steps.slice(0, 5);
	}

	const currentIndex = plan.steps.findIndex((step) => step.id === currentStep.id);

	if (currentIndex < 0) {
		return plan.steps.slice(0, 5);
	}

	return plan.steps.slice(currentIndex + 1, currentIndex + 6);
};

const getRemainingSeconds = ({
	endsAt,
	pausedRemainingSeconds,
	status,
}: {
	status: CookSessionTimerSnapshot['status'];
	endsAt: Date | null;
	pausedRemainingSeconds: number | null;
}): number | null => {
	if (status === 'paused') {
		return pausedRemainingSeconds;
	}

	if (status !== 'running' || !endsAt) {
		return null;
	}

	return Math.max(0, Math.ceil((endsAt.getTime() - Date.now()) / 1000));
};

const formatSessionEventMessage = ({
	eventType,
	payload,
}: {
	eventType: SessionEventType;
	payload: (typeof sessionEvents.$inferSelect)['payload'];
}): string => {
	switch (eventType) {
		case 'progress':
			return (
				(payload as SessionEventPayloadByType['progress']).message ??
				((payload as SessionEventPayloadByType['progress']).status === 'completed'
					? 'ステップを完了しました。'
					: 'ステップを開始しました。')
			);
		case 'delay':
			return (
				(payload as SessionEventPayloadByType['delay']).message ??
				`進行が ${(payload as SessionEventPayloadByType['delay']).delayMinutes} 分遅れています。`
			);
		case 'mistake':
			return (
				(payload as SessionEventPayloadByType['mistake']).message ?? '調理中の問題を記録しました。'
			);
		case 'ingredient_shortage':
			return (
				(payload as SessionEventPayloadByType['ingredient_shortage']).message ??
				`${(payload as SessionEventPayloadByType['ingredient_shortage']).ingredientName} が不足しています。`
			);
		case 'user_request':
			return (
				(payload as SessionEventPayloadByType['user_request']).message ??
				(payload as SessionEventPayloadByType['user_request']).requestedChange
			);
		case 'replan_applied':
			return (
				(payload as SessionEventPayloadByType['replan_applied']).message ??
				(payload as SessionEventPayloadByType['replan_applied']).appliedPatch.summary ??
				'工程を更新しました。'
			);
		case 'timer':
			return (
				(payload as SessionEventPayloadByType['timer']).message ??
				`タイマー ${(payload as SessionEventPayloadByType['timer']).timerId} を ${(payload as SessionEventPayloadByType['timer']).action} にしました。`
			);
	}
};

const mapTimer = (timer: typeof sessionTimers.$inferSelect): CookSessionTimerSnapshot => ({
	id: timer.id,
	planTimerId: timer.planTimerId,
	stepId: timer.stepId,
	label: timer.label,
	durationSeconds: timer.durationSeconds,
	pausedRemainingSeconds: timer.pausedRemainingSeconds,
	status: timer.status,
	startedAt: timer.startedAt?.toISOString() ?? null,
	endsAt: timer.endsAt?.toISOString() ?? null,
	remainingSeconds: getRemainingSeconds({
		endsAt: timer.endsAt,
		pausedRemainingSeconds: timer.pausedRemainingSeconds,
		status: timer.status,
	}),
});

const mapEvent = (event: typeof sessionEvents.$inferSelect): CookSessionEventSummary => ({
	id: event.id,
	eventType: event.eventType,
	message: formatSessionEventMessage({
		eventType: event.eventType,
		payload: event.payload,
	}),
	occurredAt: event.occurredAt.toISOString(),
	stepId: event.stepId,
});

const getPlanVersionDocument = async ({
	planId,
	userId,
	versionId,
}: {
	planId: string;
	userId: string;
	versionId: string;
}) => {
	const [version] = await db
		.select({
			id: planVersions.id,
			versionNumber: planVersions.versionNumber,
			planJson: planVersions.planJson,
		})
		.from(planVersions)
		.innerJoin(plans, eq(planVersions.planId, plans.id))
		.where(
			and(
				eq(planVersions.id, versionId),
				eq(planVersions.planId, planId),
				eq(plans.userId, userId),
			),
		);

	if (!version) {
		return null;
	}

	const parsedPlan = planDocumentSchema.safeParse(version.planJson);

	if (!parsedPlan.success) {
		throw new Error('Active plan version is incompatible.');
	}

	return {
		id: version.id,
		versionNumber: version.versionNumber,
		document: parsedPlan.data,
	};
};

export const getOwnedCookSessionSnapshotBySessionId = async (
	sessionId: string,
	userId: string,
): Promise<CookSessionSnapshot | null> => {
	const validSessionId = parseUuid(sessionId);

	if (!validSessionId) {
		return null;
	}

	const [session] = await db
		.select({
			id: cookingSessions.id,
			planId: cookingSessions.planId,
			planVersionId: cookingSessions.planVersionId,
			status: cookingSessions.status,
			currentStepId: cookingSessions.currentStepId,
			startedAt: cookingSessions.startedAt,
			completedAt: cookingSessions.completedAt,
			updatedAt: cookingSessions.updatedAt,
			title: plans.title,
			requestedServings: plans.requestedServings,
		})
		.from(cookingSessions)
		.innerJoin(plans, eq(cookingSessions.planId, plans.id))
		.where(and(eq(cookingSessions.id, validSessionId), eq(cookingSessions.userId, userId)));

	if (!session) {
		return null;
	}

	const version = await getPlanVersionDocument({
		planId: session.planId,
		userId,
		versionId: session.planVersionId,
	});

	if (!version) {
		return null;
	}

	const [timers, events] = await Promise.all([
		db
			.select()
			.from(sessionTimers)
			.where(eq(sessionTimers.sessionId, session.id))
			.orderBy(desc(sessionTimers.updatedAt)),
		db
			.select()
			.from(sessionEvents)
			.where(eq(sessionEvents.sessionId, session.id))
			.orderBy(desc(sessionEvents.occurredAt))
			.limit(20),
	]);

	const currentStep = getStepById(version.document, session.currentStepId);

	return {
		plan: {
			id: session.planId,
			title: session.title,
			requestedServings: session.requestedServings,
			versionId: version.id,
			versionNumber: version.versionNumber,
			document: version.document,
		},
		session: {
			id: session.id,
			status: session.status,
			currentStepId: currentStep?.id ?? null,
			startedAt: session.startedAt?.toISOString() ?? null,
			completedAt: session.completedAt?.toISOString() ?? null,
			updatedAt: session.updatedAt.toISOString(),
		},
		currentStep,
		nextStep: getNextStep(version.document, currentStep),
		upcomingSteps: getUpcomingSteps(version.document, currentStep),
		timers: timers.map(mapTimer),
		recentEvents: events.map(mapEvent),
	};
};

export const getOwnedCookSessionSnapshotByPlanId = async (
	planId: string,
	userId: string,
): Promise<CookSessionSnapshot | null> => {
	const validPlanId = parseUuid(planId);

	if (!validPlanId) {
		return null;
	}

	const [plan] = await db
		.select({
			id: plans.id,
			title: plans.title,
			requestedServings: plans.requestedServings,
			activeVersionId: plans.activeVersionId,
		})
		.from(plans)
		.where(and(eq(plans.id, validPlanId), eq(plans.userId, userId)));

	if (!plan?.activeVersionId) {
		return null;
	}

	const [activeSession] = await db
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

	if (activeSession) {
		return getOwnedCookSessionSnapshotBySessionId(activeSession.id, userId);
	}

	const version = await getPlanVersionDocument({
		planId: plan.id,
		userId,
		versionId: plan.activeVersionId,
	});

	if (!version) {
		return null;
	}

	const currentStep = getDefaultCurrentStep(version.document);

	return {
		plan: {
			id: plan.id,
			title: plan.title,
			requestedServings: plan.requestedServings,
			versionId: version.id,
			versionNumber: version.versionNumber,
			document: version.document,
		},
		session: null,
		currentStep,
		nextStep: getNextStep(version.document, currentStep),
		upcomingSteps: getUpcomingSteps(version.document, currentStep),
		timers: [],
		recentEvents: [],
	};
};
