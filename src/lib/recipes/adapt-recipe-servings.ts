import 'server-only';

import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { getRequiredEnv } from '@/lib/env';
import type { PlanningSettings } from '@/lib/planning-settings';
import { getPlanningSettingsSummary } from '@/lib/planning-settings';
import { formatIngredientLine, scalePlanMaterial } from '@/lib/plans/presentation';
import {
	normalizedIngredientSchema,
	normalizedRecipeStepSchema,
	recipeMaterialChangeSchema,
	recipeStepChangeSchema,
} from '@/lib/plans/schema';
import type {
	NormalizedIngredient,
	NormalizedRecipe,
	RecipeMaterialChange,
	RecipeStepChange,
} from '@/lib/plans/types';

const openai = createOpenAI({
	apiKey: getRequiredEnv('OPENAI_API_KEY'),
});

const scaleIngredient = ({
	baseServings,
	ingredient,
	targetServings,
}: {
	baseServings: number;
	ingredient: NormalizedIngredient;
	targetServings: number;
}): NormalizedIngredient => {
	const scaledMaterial = scalePlanMaterial(
		{
			id: ingredient.id,
			name: ingredient.name,
			amount: ingredient.amount,
			amountValue: ingredient.amountValue,
			amountMin: ingredient.amountMin,
			amountMax: ingredient.amountMax,
			unit: ingredient.unit,
		},
		baseServings,
		targetServings,
	);

	return {
		...ingredient,
		amount: scaledMaterial.amount,
		amountValue: scaledMaterial.amountValue,
		amountMin: scaledMaterial.amountMin,
		amountMax: scaledMaterial.amountMax,
		unit: scaledMaterial.unit,
	};
};

const buildScaledRecipe = ({
	baseServings,
	recipe,
	targetServings,
}: {
	baseServings: number;
	recipe: NormalizedRecipe;
	targetServings: number;
}): NormalizedRecipe => ({
	...recipe,
	description: recipe.description,
	ingredients: recipe.ingredients.map((ingredient) =>
		scaleIngredient({
			baseServings,
			ingredient,
			targetServings,
		}),
	),
	metadata: {
		...(recipe.metadata ?? {}),
		adaptedFromServings: baseServings,
		adaptedToServings: targetServings,
	},
	servings: targetServings,
});

const buildIngredientReference = (ingredients: NormalizedIngredient[]): string[] =>
	ingredients.map((ingredient) => `- ${formatIngredientLine(ingredient)}`);

const buildStepsReference = (steps: NormalizedRecipe['steps']): string[] =>
	steps.map((step) => `- ${step.id} | STEP ${step.order} | ${step.text}`);

const getIngredientSignature = (ingredient: NormalizedIngredient): string =>
	JSON.stringify({
		amount: ingredient.amount ?? null,
		amountMax: ingredient.amountMax ?? null,
		amountMin: ingredient.amountMin ?? null,
		amountValue: ingredient.amountValue ?? null,
		name: ingredient.name,
		optional: ingredient.optional ?? null,
		preparation: ingredient.preparation ?? null,
		unit: ingredient.unit ?? null,
	});

const buildFallbackMaterialChanges = ({
	baseIngredients,
	optimizedIngredients,
}: {
	baseIngredients: NormalizedIngredient[];
	optimizedIngredients: NormalizedIngredient[];
}): RecipeMaterialChange[] => {
	const optimizedById = new Map(
		optimizedIngredients.map((ingredient) => [ingredient.id, ingredient]),
	);
	const baseById = new Map(baseIngredients.map((ingredient) => [ingredient.id, ingredient]));
	const changes: RecipeMaterialChange[] = [];

	for (const ingredient of baseIngredients) {
		const optimizedIngredient = optimizedById.get(ingredient.id);

		if (!optimizedIngredient) {
			changes.push({
				changeType: 'remove',
				confidence: 'medium',
				ingredientId: ingredient.id,
				ingredientName: ingredient.name,
				reason: '最適化後のレシピではこの材料を使わないためです。',
			});
			continue;
		}

		if (getIngredientSignature(ingredient) === getIngredientSignature(optimizedIngredient)) {
			continue;
		}

		changes.push({
			changeType: ingredient.name === optimizedIngredient.name ? 'scale' : 'substitute',
			confidence: 'medium',
			ingredientId: ingredient.id,
			ingredientName: ingredient.name,
			nextIngredientId: optimizedIngredient.id,
			nextIngredientName: optimizedIngredient.name,
			reason:
				ingredient.name === optimizedIngredient.name
					? '人数や制約に合わせて材料の扱いを調整したためです。'
					: '人数や制約に合わせて材料を置き換えたためです。',
		});
	}

	for (const ingredient of optimizedIngredients) {
		if (baseById.has(ingredient.id)) {
			continue;
		}

		changes.push({
			changeType: 'add',
			confidence: 'medium',
			ingredientId: null,
			ingredientName: ingredient.name,
			nextIngredientId: ingredient.id,
			nextIngredientName: ingredient.name,
			reason: '最適化後のレシピで必要になったため追加しました。',
		});
	}

	return changes;
};

export const adaptRecipeServings = async ({
	baseServings,
	planningSettings,
	recipe,
	targetServings,
}: {
	baseServings: number;
	planningSettings: PlanningSettings;
	recipe: NormalizedRecipe;
	targetServings: number;
}): Promise<{
	adjustedRecipe: NormalizedRecipe;
	materialChanges: RecipeMaterialChange[];
	stepChanges: RecipeStepChange[];
}> => {
	if (baseServings <= 0 || targetServings <= 0) {
		throw new Error('Invalid servings for recipe adaptation.');
	}

	const scaledRecipe = buildScaledRecipe({
		baseServings,
		recipe,
		targetServings,
	});

	const planningSettingsSummary = getPlanningSettingsSummary(planningSettings);
	const outputSchema = z.object({
		description: z.string().trim().min(1).max(240).nullable(),
		ingredients: z.array(normalizedIngredientSchema).min(1).max(200),
		steps: z.array(normalizedRecipeStepSchema).length(recipe.steps.length),
		materialChanges: z.array(recipeMaterialChangeSchema).max(scaledRecipe.ingredients.length + 12),
		stepChanges: z.array(recipeStepChangeSchema).max(recipe.steps.length * 3),
	});

	const { output } = await generateText({
		model: openai('gpt-5.4-mini'),
		system: [
			'You optimize a recipe for a cooking-planning prototype before timeline generation.',
			'All human-readable output must be concise natural Japanese.',
			'Keep the same number of steps and preserve each step id and order exactly as provided.',
			'You may rewrite ingredients and wording inside each step to reflect servings, kitchen constraints, available equipment, batch count, heating time, fire level, cookware usage, and pacing.',
			'Preserve the identity of the dish and stay conservative with substitutions.',
			'Reuse original ingredient ids whenever the ingredient remains conceptually the same. Use new ids only for truly new ingredients.',
			'Do not invent advanced techniques or safety-critical claims that are not implied by the original recipe.',
			'If you are uncertain whether heating time or fire level should change, stay conservative and keep the original intent.',
			'Use the scaled ingredient list as the baseline source of truth, but you may add, remove, merge, split, or substitute ingredients when needed to satisfy the constraints.',
			'Return materialChanges only for meaningful ingredient changes beyond obvious servings scaling.',
			'Do not invent advanced techniques or safety-critical claims that are not implied by the original recipe.',
			'Return stepChanges only for meaningful changes.',
		].join(' '),
		prompt: [
			`元人数: ${baseServings}人分`,
			`目標人数: ${targetServings}人分`,
			`レシピ名: ${recipe.title}`,
			recipe.description ? `レシピ要約: ${recipe.description}` : undefined,
			'',
			'最適化の前提:',
			`- 利用可能な器具: ${planningSettingsSummary.plannerAvailableEquipment.join('、') || '特記事項なし'}`,
			`- 制約: ${planningSettingsSummary.plannerConstraints.join(' / ') || '特記事項なし'}`,
			'',
			'人数反映後のベース材料:',
			...buildIngredientReference(scaledRecipe.ingredients),
			'',
			'元の手順:',
			...buildStepsReference(recipe.steps),
			'',
			'出力ルール:',
			'- 各 step の id と order は入力と同じ値を返してください。',
			'- ingredients は最終的に採用する材料一覧にしてください。',
			'- text は最適化後の自然な手順文にしてください。',
			'- 加熱時間や火加減を変える場合は、人数・器具・制約に必要な差だけ反映してください。',
			'- materialChanges には add/remove/substitute/merge/split などの変更理由を入れてください。単純な人数換算だけなら空配列で構いません。',
			'- notes は必要な補足がある時だけ返してください。',
			'- description は最適化後に補足したい要約があれば返し、不要なら null にしてください。',
		]
			.filter(Boolean)
			.join('\n'),
		output: Output.object({
			schema: outputSchema,
			name: 'recipe_servings_adaptation',
			description: 'Recipe steps rewritten for target servings.',
		}),
		providerOptions: {
			openai: {
				reasoningEffort: 'medium',
				textVerbosity: 'low',
			},
		},
	});

	const originalStepsById = new Map(recipe.steps.map((step) => [step.id, step]));
	const adjustedSteps = output.steps.map((step) => {
		const originalStep = originalStepsById.get(step.id);

		if (!originalStep || originalStep.order !== step.order) {
			throw new Error('Adjusted recipe steps do not match the original step structure.');
		}

		return {
			...originalStep,
			notes: step.notes ?? originalStep.notes,
			text: step.text,
		};
	});

	const materialChanges =
		output.materialChanges.length > 0
			? output.materialChanges
			: buildFallbackMaterialChanges({
					baseIngredients: scaledRecipe.ingredients,
					optimizedIngredients: output.ingredients,
				});

	return {
		adjustedRecipe: {
			...scaledRecipe,
			description: output.description ?? scaledRecipe.description,
			ingredients: output.ingredients,
			steps: adjustedSteps,
		},
		materialChanges,
		stepChanges: output.stepChanges,
	};
};
