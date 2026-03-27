import { describe, expect, test } from 'vitest';
import { buildPlanTimelineData } from '@/lib/plans/timeline';
import type { PlanDocument } from '@/lib/plans/types';

const plan: PlanDocument = {
	servings: 4,
	steps: [
		{
			canParallelize: false,
			dependencies: [],
			description: '野菜を切る',
			estimatedMinutes: 5,
			id: 'step-1',
			title: '下ごしらえ',
		},
		{
			canParallelize: true,
			dependencies: ['step-1'],
			description: 'ソースを混ぜる',
			estimatedMinutes: 3,
			id: 'step-2',
			recipeSourceId: 'recipe-a',
			title: 'ソース準備',
		},
		{
			canParallelize: false,
			dependencies: ['step-1'],
			description: '肉を焼く',
			estimatedMinutes: 7,
			id: 'step-3',
			recipeSourceId: 'recipe-b',
			title: '焼き工程',
		},
		{
			canParallelize: false,
			dependencies: ['step-2', 'step-3'],
			description: '仕上げる',
			estimatedMinutes: 4,
			id: 'step-4',
			tags: ['cleanup'],
			title: '仕上げ',
		},
	],
	title: 'テスト献立',
	version: 1,
};

describe('buildPlanTimelineData', () => {
	test('creates shared and recipe-specific groups', () => {
		const result = buildPlanTimelineData({
			plan,
			recipeTitleById: {
				'recipe-a': '親子丼',
				'recipe-b': '味噌汁',
			},
		});

		expect(result.groups.map((group) => [group.id, group.title])).toEqual([
			['shared', '共通作業'],
			['recipe-a', '親子丼'],
			['recipe-b', '味噌汁'],
		]);
	});

	test('schedules sequential and parallel steps from dependencies', () => {
		const result = buildPlanTimelineData({
			plan,
			recipeTitleById: {
				'recipe-a': '親子丼',
				'recipe-b': '味噌汁',
			},
		});

		expect(
			result.items.map((item) => ({
				endMinute: item.endMinute,
				group: item.group,
				id: item.id,
				isCleanup: item.isCleanup,
				startMinute: item.startMinute,
			})),
		).toEqual([
			{ endMinute: 5, group: 'shared', id: 'step-1', isCleanup: false, startMinute: 0 },
			{ endMinute: 8, group: 'recipe-a', id: 'step-2', isCleanup: false, startMinute: 5 },
			{ endMinute: 12, group: 'recipe-b', id: 'step-3', isCleanup: false, startMinute: 5 },
			{ endMinute: 16, group: 'shared', id: 'step-4', isCleanup: true, startMinute: 12 },
		]);
		expect(result.totalMinutes).toBe(16);
	});

	test('uses cleanup color for cleanup-tagged steps', () => {
		const result = buildPlanTimelineData({
			plan,
			recipeTitleById: {
				'recipe-a': '親子丼',
				'recipe-b': '味噌汁',
			},
		});

		expect(result.items.find((item) => item.id === 'step-4')).toMatchObject({
			groupColor: '#d97706',
			isCleanup: true,
		});
	});

	test('falls back to recipeSourceId when title mapping is missing', () => {
		const result = buildPlanTimelineData({
			plan: {
				...plan,
				steps: [plan.steps[1]],
			},
			recipeTitleById: {},
		});

		expect(result.groups).toEqual([
			{
				color: '#475569',
				id: 'shared',
				stackItems: true,
				title: '共通作業',
			},
			{
				color: '#2563eb',
				id: 'recipe-a',
				stackItems: true,
				title: 'recipe-a',
			},
		]);
	});
});
