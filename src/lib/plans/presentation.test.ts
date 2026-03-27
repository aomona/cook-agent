import { describe, expect, test } from 'vitest';
import { formatIngredientLine, scaleIngredientLine } from '@/lib/plans/presentation';

describe('formatIngredientLine', () => {
	test('formats ingredient with amount and preparation', () => {
		expect(
			formatIngredientLine({
				amount: '200g',
				id: 'ingredient-1',
				name: '鶏もも肉',
				preparation: '一口大',
			}),
		).toBe('鶏もも肉 (200g / 一口大)');
	});

	test('returns ingredient name when no suffix is present', () => {
		expect(
			formatIngredientLine({
				id: 'ingredient-1',
				name: '塩',
			}),
		).toBe('塩');
	});
});

describe('scaleIngredientLine', () => {
	test('scales integer quantities by servings ratio', () => {
		expect(
			scaleIngredientLine({
				baseServings: 2,
				ingredient: {
					amount: '200g',
					id: 'ingredient-1',
					name: '鶏もも肉',
				},
				requestedServings: 4,
			}),
		).toBe('鶏もも肉 (400g)');
	});

	test('scales decimal quantities and trims trailing zeros', () => {
		expect(
			scaleIngredientLine({
				baseServings: 2,
				ingredient: {
					amount: '0.5 tbsp',
					id: 'ingredient-1',
					name: '塩',
				},
				requestedServings: 3,
			}),
		).toBe('塩 (0.75 tbsp)');
	});

	test('scales fractional quantities', () => {
		expect(
			scaleIngredientLine({
				baseServings: 2,
				ingredient: {
					amount: '1/2 cup',
					id: 'ingredient-1',
					name: '牛乳',
				},
				requestedServings: 4,
			}),
		).toBe('牛乳 (1 cup)');
	});

	test('scales mixed fractional quantities', () => {
		expect(
			scaleIngredientLine({
				baseServings: 2,
				ingredient: {
					amount: '1 1/2 tbsp',
					id: 'ingredient-1',
					name: '砂糖',
				},
				requestedServings: 4,
			}),
		).toBe('砂糖 (3 tbsp)');
	});

	test('returns original line when base servings are unknown', () => {
		expect(
			scaleIngredientLine({
				ingredient: {
					amount: '2個',
					id: 'ingredient-1',
					name: '卵',
				},
				requestedServings: 4,
			}),
		).toBe('卵 (2個)');
	});
});
