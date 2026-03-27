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

	test('scales full-width digits and japanese measure words', () => {
		expect(
			scaleIngredientLine({
				baseServings: 2,
				ingredient: {
					id: 'ingredient-1',
					name: '★醤油 大さじ２',
				},
				requestedServings: 4,
			}),
		).toBe('★醤油 大さじ4');
	});

	test('scales quantity ranges in ingredient lines', () => {
		expect(
			scaleIngredientLine({
				baseServings: 2,
				ingredient: {
					id: 'ingredient-1',
					name: '鶏モモ肉 小１枚（100〜125g）',
				},
				requestedServings: 4,
			}),
		).toBe('鶏モモ肉 小2枚（200〜250g）');
	});

	test('scales decimal quantities embedded in ingredient names', () => {
		expect(
			scaleIngredientLine({
				baseServings: 2,
				ingredient: {
					id: 'ingredient-1',
					name: '玉ねぎ 0.25個（50g）',
				},
				requestedServings: 4,
			}),
		).toBe('玉ねぎ 0.5個（100g）');
	});

	test('scales full-width ranges', () => {
		expect(
			scaleIngredientLine({
				baseServings: 2,
				ingredient: {
					id: 'ingredient-1',
					name: '卵 ３〜４個',
				},
				requestedServings: 4,
			}),
		).toBe('卵 6〜8個');
	});
});
