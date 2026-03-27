import { describe, expect, test } from 'vitest';
import {
	buildNormalizedIngredients,
	normalizeRecipeSummary,
} from '@/lib/recipes/normalize-recipe-summary';

describe('buildNormalizedIngredients', () => {
	test('uses structured material amounts when available', () => {
		expect(
			buildNormalizedIngredients({
				ingredientsText: ['fallback line'],
				materials: [
					{
						amount: {
							max: null,
							min: null,
							text: '1/2個',
							unit: '個',
							value: 0.5,
						},
						name: '玉ねぎ',
						optional: false,
						preparation: '薄切り',
						rawLine: '玉ねぎ 1/2個 薄切り',
					},
				],
			}),
		).toEqual([
			{
				amount: '1/2個',
				amountMax: undefined,
				amountMin: undefined,
				amountValue: 0.5,
				id: 'ingredient-1',
				name: '玉ねぎ',
				optional: false,
				preparation: '薄切り',
				unit: '個',
			},
		]);
	});

	test('supports quantity ranges like 1~2人前', () => {
		expect(
			buildNormalizedIngredients({
				ingredientsText: [],
				materials: [
					{
						amount: {
							max: 2,
							min: 1,
							text: '1~2人前',
							unit: '人前',
							value: null,
						},
						name: 'カレールウ',
						rawLine: 'カレールウ 1~2人前',
					},
				],
			}),
		).toEqual([
			{
				amount: '1~2人前',
				amountMax: 2,
				amountMin: 1,
				amountValue: undefined,
				id: 'ingredient-1',
				name: 'カレールウ',
				optional: undefined,
				preparation: undefined,
				unit: '人前',
			},
		]);
	});

	test('falls back to raw ingredient lines when structured materials are missing', () => {
		expect(
			buildNormalizedIngredients({
				ingredientsText: ['塩 小さじ1'],
				materials: [],
			}),
		).toEqual([
			{
				id: 'ingredient-1',
				name: '塩 小さじ1',
			},
		]);
	});
});

describe('normalizeRecipeSummary', () => {
	test('treats ranged servings as ambiguous instead of parsing a single number', () => {
		const normalizedRecipe = normalizeRecipeSummary({
			ingredientsText: [],
			instructionsText: ['混ぜる'],
			materials: [],
			servingsText: '1~2人前',
			summary: 'summary',
			title: 'title',
		});

		expect(normalizedRecipe?.servings).toBeUndefined();
	});
});
