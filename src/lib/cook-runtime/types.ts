import type { PlanDocument, PlanStep, SessionEventRecord } from '@/lib/plans/types';

export type CookSessionStatus = 'not_started' | 'active' | 'paused' | 'completed' | 'abandoned';

export type CookTimerStatus = 'running' | 'paused' | 'done' | 'cancelled';

export type CookSessionTimerSnapshot = {
	id: string;
	planTimerId: string;
	stepId: string;
	label: string;
	durationSeconds: number;
	pausedRemainingSeconds: number | null;
	status: CookTimerStatus;
	startedAt: string | null;
	endsAt: string | null;
	remainingSeconds: number | null;
};

export type CookSessionEventSummary = {
	id: string;
	eventType: SessionEventRecord['eventType'];
	message: string;
	occurredAt: string;
	stepId: string | null;
};

export type CookSessionSnapshot = {
	plan: {
		id: string;
		title: string;
		requestedServings: number | null;
		versionId: string;
		versionNumber: number;
		document: PlanDocument;
	};
	session: {
		id: string;
		status: CookSessionStatus;
		currentStepId: string | null;
		startedAt: string | null;
		completedAt: string | null;
		updatedAt: string;
	} | null;
	currentStep: PlanStep | null;
	nextStep: PlanStep | null;
	upcomingSteps: PlanStep[];
	timers: CookSessionTimerSnapshot[];
	recentEvents: CookSessionEventSummary[];
};
