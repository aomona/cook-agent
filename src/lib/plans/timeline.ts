import { isCleanupPlanStep } from '@/lib/plans/step-tags';
import type { PlanDocument } from '@/lib/plans/types';

export type PlanTimelineGroupData = {
	color: string;
	id: string;
	stackItems: true;
	title: string;
};

export type PlanTimelineItemData = {
	description: string;
	durationMinutes: number;
	endMinute: number;
	group: string;
	groupColor: string;
	id: string;
	isCleanup: boolean;
	kind: string;
	recipeSourceId: string | null;
	req: Record<string, number>;
	startMinute: number;
	stepNumber: number;
	title: string;
	uses: string[];
	slack: number;
	after: string[];
};

export type PlanTimelinePalette = {
	finish: string;
	groupColors: string[];
	shared: string;
	wait: string;
};

const DEFAULT_GROUP_ID = 'shared';

export const LIGHT_PLAN_TIMELINE_PALETTE: PlanTimelinePalette = {
	finish: '#7c3aed',
	groupColors: ['#2563eb', '#059669', '#dc2626', '#7c3aed', '#0891b2', '#d97706'],
	shared: '#475569',
	wait: '#22c55e',
};

export const DARK_PLAN_TIMELINE_PALETTE: PlanTimelinePalette = {
	finish: '#6d28d9',
	groupColors: ['#1d4ed8', '#047857', '#b91c1c', '#6d28d9', '#0e7490', '#b45309'],
	shared: '#334155',
	wait: '#15803d',
};

const getTimelineColor = ({
	groupColor,
	kind,
	palette,
}: {
	groupColor: string;
	kind: string;
	palette: PlanTimelinePalette;
}): string => {
	if (kind === 'wait') {
		return palette.wait;
	}

	if (kind === 'finish') {
		return palette.finish;
	}

	return groupColor;
};

export const buildPlanTimelineData = ({
	palette = LIGHT_PLAN_TIMELINE_PALETTE,
	plan,
	recipeTitleById,
}: {
	palette?: PlanTimelinePalette;
	plan: PlanDocument;
	recipeTitleById: Record<string, string>;
}): {
	groups: PlanTimelineGroupData[];
	items: PlanTimelineItemData[];
	totalMinutes: number;
} => {
	const groups: PlanTimelineGroupData[] = [
		{
			color: palette.shared,
			id: DEFAULT_GROUP_ID,
			stackItems: true,
			title: '共通作業',
		},
	];
	const groupIds = new Set<string>([DEFAULT_GROUP_ID]);
	let colorIndex = 0;

	for (const step of plan.steps) {
		if (!step.recipeSourceId || groupIds.has(step.recipeSourceId)) {
			continue;
		}

		groups.push({
			color: palette.groupColors[colorIndex % palette.groupColors.length] ?? palette.groupColors[0],
			id: step.recipeSourceId,
			stackItems: true,
			title: recipeTitleById[step.recipeSourceId] ?? step.recipeSourceId,
		});
		groupIds.add(step.recipeSourceId);
		colorIndex += 1;
	}

	const groupColorById = new Map(groups.map((group) => [group.id, group.color]));
	const items: PlanTimelineItemData[] = plan.steps.map((step, index) => {
		const group =
			step.recipeSourceId && groupIds.has(step.recipeSourceId)
				? step.recipeSourceId
				: DEFAULT_GROUP_ID;
		const baseGroupColor = groupColorById.get(group) ?? palette.shared;
		const isCleanup = isCleanupPlanStep(step);

		return {
			after: [...step.after],
			description: step.instructions,
			durationMinutes: step.time,
			endMinute: step.timeline.end,
			group,
			groupColor: getTimelineColor({
				groupColor: baseGroupColor,
				kind: step.kind,
				palette,
			}),
			id: step.id,
			isCleanup,
			kind: step.kind,
			recipeSourceId: step.recipeSourceId ?? null,
			req: step.req ? { ...step.req } : {},
			slack: step.slack ?? 0,
			startMinute: step.timeline.start,
			stepNumber: index + 1,
			title: step.label,
			uses: [...(step.uses ?? [])],
		};
	});

	return {
		groups,
		items,
		totalMinutes: Math.max(...items.map((item) => item.endMinute), 0),
	};
};
