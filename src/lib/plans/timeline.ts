import { isCleanupPlanStep } from '@/lib/plans/step-tags';
import type { PlanDocument } from '@/lib/plans/types';

export type PlanTimelineGroupData = {
	color: string;
	id: string;
	stackItems: true;
	title: string;
};

export type PlanTimelineItemData = {
	canParallelize: boolean;
	description: string;
	durationMinutes: number;
	endMinute: number;
	group: string;
	groupColor: string;
	id: string;
	isCleanup: boolean;
	startMinute: number;
	stepNumber: number;
	title: string;
};

const DEFAULT_GROUP_ID = 'shared';
const GROUP_COLORS = ['#2563eb', '#d97706', '#059669', '#dc2626', '#7c3aed', '#0891b2'];

export const buildPlanTimelineData = ({
	plan,
	recipeTitleById,
}: {
	plan: PlanDocument;
	recipeTitleById: Record<string, string>;
}): {
	groups: PlanTimelineGroupData[];
	items: PlanTimelineItemData[];
	totalMinutes: number;
} => {
	const groups: PlanTimelineGroupData[] = [
		{
			color: '#475569',
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
			color: GROUP_COLORS[colorIndex % GROUP_COLORS.length] ?? '#2563eb',
			id: step.recipeSourceId,
			stackItems: true,
			title: recipeTitleById[step.recipeSourceId] ?? step.recipeSourceId,
		});
		groupIds.add(step.recipeSourceId);
		colorIndex += 1;
	}

	const groupColorById = new Map(groups.map((group) => [group.id, group.color]));
	const stepEndMinuteById = new Map<string, number>();
	const items: PlanTimelineItemData[] = [];
	let sequentialCursor = 0;

	for (const [index, step] of plan.steps.entries()) {
		const dependencyEndMinute = step.dependencies.reduce((latestMinute, dependencyId) => {
			const dependencyEnd = stepEndMinuteById.get(dependencyId) ?? 0;

			return Math.max(latestMinute, dependencyEnd);
		}, 0);
		const startMinute = step.canParallelize
			? dependencyEndMinute
			: Math.max(dependencyEndMinute, sequentialCursor);
		const endMinute = startMinute + step.estimatedMinutes;
		const group =
			step.recipeSourceId && groupIds.has(step.recipeSourceId)
				? step.recipeSourceId
				: DEFAULT_GROUP_ID;
		const isCleanup = isCleanupPlanStep(step);
		const groupColor = isCleanup ? '#d97706' : (groupColorById.get(group) ?? '#475569');

		stepEndMinuteById.set(step.id, endMinute);

		if (!step.canParallelize) {
			sequentialCursor = endMinute;
		}

		items.push({
			canParallelize: step.canParallelize,
			description: step.description,
			durationMinutes: step.estimatedMinutes,
			endMinute,
			group,
			groupColor,
			id: step.id,
			isCleanup,
			startMinute,
			stepNumber: index + 1,
			title: step.title,
		});
	}

	return {
		groups,
		items,
		totalMinutes: Math.max(...items.map((item) => item.endMinute), 0),
	};
};
