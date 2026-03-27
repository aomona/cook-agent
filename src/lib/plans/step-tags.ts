import type { PlanStep } from '@/lib/plans/types';

const cleanupTagNames = new Set(['cleanup', 'dishwashing', 'washing-up']);

export const isCleanupPlanStep = (step: Pick<PlanStep, 'tags'>): boolean =>
	step.tags?.some((tag) => cleanupTagNames.has(tag.toLowerCase())) ?? false;
