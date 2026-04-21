import { describe, expect, test } from 'vitest';
import { buildPlanTimelineData } from '@/lib/plans/timeline';
import type { PlanDocument } from '@/lib/plans/types';

const plan: PlanDocument = {
	version: 2,
	title: 'テスト献立',
	servings: 4,
	materials: [
		{
			id: 'recipe-a:ingredient-1',
			name: '卵',
			recipeSourceId: 'recipe-a',
			sourceIngredientId: 'ingredient-1',
		},
	],
	steps: [
		{
			id: 'shared:prep',
			label: '下ごしらえ',
			instructions: '野菜を切る',
			timeline: { start: 0, end: 5 },
			time: 5,
			after: [],
			kind: 'prep',
		},
		{
			id: 'recipe-a:mix',
			label: 'ソース準備',
			instructions: 'ソースを混ぜる',
			timeline: { start: 5, end: 8 },
			time: 3,
			after: ['shared:prep'],
			kind: 'prep',
			recipeSourceId: 'recipe-a',
			uses: ['recipe-a:ingredient-1'],
		},
		{
			id: 'recipe-b:cook',
			label: '焼き工程',
			instructions: '肉を焼く',
			timeline: { start: 5, end: 12 },
			time: 7,
			after: ['shared:prep'],
			kind: 'cook',
			recipeSourceId: 'recipe-b',
			req: { stove: 1 },
		},
		{
			id: 'shared:cleanup',
			label: '仕上げ前の洗い物',
			instructions: 'ボウルとまな板を洗う',
			timeline: { start: 12, end: 16 },
			time: 4,
			after: ['recipe-a:mix', 'recipe-b:cook'],
			kind: 'cleanup',
			tags: ['cleanup'],
		},
	],
	metadata: {
		availableEquipment: ['stove'],
		constraints: [],
		recipeSourceIds: ['recipe-a', 'recipe-b'],
	},
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

	test('maps explicit timeline fields without recomputing schedule', () => {
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
				kind: item.kind,
				startMinute: item.startMinute,
			})),
		).toEqual([
			{ endMinute: 5, group: 'shared', id: 'shared:prep', kind: 'prep', startMinute: 0 },
			{ endMinute: 8, group: 'recipe-a', id: 'recipe-a:mix', kind: 'prep', startMinute: 5 },
			{ endMinute: 12, group: 'recipe-b', id: 'recipe-b:cook', kind: 'cook', startMinute: 5 },
			{ endMinute: 16, group: 'shared', id: 'shared:cleanup', kind: 'cleanup', startMinute: 12 },
		]);
		expect(result.totalMinutes).toBe(16);
	});

	test('keeps cleanup steps on their group color', () => {
		const result = buildPlanTimelineData({
			plan,
			recipeTitleById: {
				'recipe-a': '親子丼',
				'recipe-b': '味噌汁',
			},
		});

		expect(result.items.find((item) => item.id === 'shared:cleanup')).toMatchObject({
			groupColor: '#475569',
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
