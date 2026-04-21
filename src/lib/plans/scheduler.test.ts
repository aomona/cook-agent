import { describe, expect, test } from 'vitest';
import {
	computeConflicts,
	levelResources,
	type PlanResourceCapacity,
	scheduleGreedy,
} from '@/lib/plans/scheduler';
import type { PlanStep } from '@/lib/plans/types';

const capacity: PlanResourceCapacity = {
	hands: 1,
	stove: 1,
};

const baseSteps: PlanStep[] = [
	{
		id: 'recipe-a:boil',
		label: '湯を沸かす',
		instructions: '鍋の湯を沸かす',
		timeline: { start: 0, end: 10 },
		time: 10,
		after: [],
		kind: 'cook',
		req: { stove: 1 },
		slack: 5,
	},
	{
		id: 'recipe-b:saute',
		label: '具材を炒める',
		instructions: 'フライパンで炒める',
		timeline: { start: 4, end: 10 },
		time: 6,
		after: [],
		kind: 'cook',
		req: { stove: 1 },
		slack: 10,
	},
];

describe('computeConflicts', () => {
	test('returns overlapping resource conflicts', () => {
		const conflicts = computeConflicts(baseSteps, capacity);

		expect(conflicts).toEqual([
			{
				cap: 1,
				culprits: ['recipe-a:boil', 'recipe-b:saute'],
				end: 10,
				res: 'stove',
				start: 4,
				text: 'コンロ が 4-10分 の間 2>1',
				usage: 2,
			},
		]);
	});
});

describe('scheduleGreedy', () => {
	test('moves later steps inside slack to satisfy capacity', () => {
		const scheduled = scheduleGreedy(baseSteps, capacity, { step: 1 });
		const normalizedSchedule = scheduled.map((step) => [
			step.id,
			Object.is(step.timeline.start, -0) ? 0 : step.timeline.start,
			step.timeline.end,
		]);

		expect(normalizedSchedule).toEqual([
			['recipe-a:boil', 0, 10],
			['recipe-b:saute', 10, 16],
		]);
		expect(computeConflicts(scheduled, capacity)).toEqual([]);
	});
});

describe('levelResources', () => {
	test('reduces peak resource conflicts when a movable step exists', () => {
		const leveled = levelResources(baseSteps, capacity, { step: 1 });

		expect(computeConflicts(leveled, capacity)).toEqual([]);
		expect(leveled.some((step) => step.timeline.start >= 10 && (step.req?.stove ?? 0) > 0)).toBe(
			true,
		);
	});
});
