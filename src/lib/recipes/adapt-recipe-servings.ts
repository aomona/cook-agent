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
	recipeIngredientDecisionSchema,
	recipeStepChangeSchema,
} from '@/lib/plans/schema';
import type {
	NormalizedIngredient,
	NormalizedRecipe,
	RecipeIngredientDecision,
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

const normalizeIngredientName = (value: string): string =>
	value
		.normalize('NFKC')
		.replace(/（[^）]*用）/g, '')
		.replace(/\([^)]*用\)/g, '')
		.replace(/[\s　]+/g, '')
		.toLowerCase();

const buildIngredientIndex = (
	ingredients: NormalizedIngredient[],
): Map<string, NormalizedIngredient> =>
	new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));

const findIngredientByName = ({
	candidates,
	name,
}: {
	candidates: NormalizedIngredient[];
	name: string;
}): NormalizedIngredient | null => {
	const normalizedTarget = normalizeIngredientName(name);

	for (const candidate of candidates) {
		if (normalizeIngredientName(candidate.name) === normalizedTarget) {
			return candidate;
		}
	}

	return null;
};

const resolveOptimizedIngredientsForDecision = ({
	decision,
	optimizedById,
	optimizedIngredients,
}: {
	decision: RecipeIngredientDecision;
	optimizedById: Map<string, NormalizedIngredient>;
	optimizedIngredients: NormalizedIngredient[];
}): NormalizedIngredient[] => {
	const matchedById = (decision.nextIngredientIds ?? [])
		.map((ingredientId) => optimizedById.get(ingredientId) ?? null)
		.filter((ingredient): ingredient is NormalizedIngredient => ingredient !== null);

	if (matchedById.length > 0) {
		return matchedById;
	}

	if (decision.ingredientId) {
		const exactMatch = optimizedById.get(decision.ingredientId);

		if (exactMatch) {
			return [exactMatch];
		}
	}

	const sameNameMatch = findIngredientByName({
		candidates: optimizedIngredients,
		name: decision.ingredientName,
	});

	return sameNameMatch ? [sameNameMatch] : [];
};

const buildMaterialChangesFromDecisions = ({
	baseIngredients,
	decisions,
	optimizedIngredients,
}: {
	baseIngredients: NormalizedIngredient[];
	decisions: RecipeIngredientDecision[];
	optimizedIngredients: NormalizedIngredient[];
}): RecipeMaterialChange[] => {
	const baseById = buildIngredientIndex(baseIngredients);
	const optimizedById = buildIngredientIndex(optimizedIngredients);
	const optimizedWithoutMatches = new Set(optimizedIngredients.map((ingredient) => ingredient.id));
	const changes: RecipeMaterialChange[] = [];

	for (const decision of decisions) {
		const baseIngredient = decision.ingredientId
			? (baseById.get(decision.ingredientId) ?? null)
			: null;
		const matchedOptimizedIngredients = resolveOptimizedIngredientsForDecision({
			decision,
			optimizedById,
			optimizedIngredients,
		});

		for (const ingredient of matchedOptimizedIngredients) {
			optimizedWithoutMatches.delete(ingredient.id);
		}

		if (!decision.needsChange || decision.changeType === 'keep') {
			continue;
		}

		const primaryOptimizedIngredient = matchedOptimizedIngredients[0] ?? null;

		if (primaryOptimizedIngredient) {
			optimizedWithoutMatches.delete(primaryOptimizedIngredient.id);
		}

		changes.push({
			changeType: decision.changeType,
			confidence: decision.confidence,
			ingredientId: baseIngredient?.id ?? decision.ingredientId ?? null,
			ingredientName: baseIngredient?.name ?? decision.ingredientName,
			nextIngredientId: primaryOptimizedIngredient?.id ?? null,
			nextIngredientName:
				matchedOptimizedIngredients.length > 1
					? matchedOptimizedIngredients.map((ingredient) => ingredient.name).join(' / ')
					: (primaryOptimizedIngredient?.name ?? null),
			reason: decision.reason,
		});
	}

	for (const ingredientId of optimizedWithoutMatches) {
		const optimizedIngredient = optimizedById.get(ingredientId);

		if (!optimizedIngredient) {
			continue;
		}

		changes.push({
			changeType: 'add',
			confidence: 'medium',
			ingredientId: null,
			ingredientName: optimizedIngredient.name,
			nextIngredientId: optimizedIngredient.id,
			nextIngredientName: optimizedIngredient.name,
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
	ingredientDecisions: RecipeIngredientDecision[];
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
		ingredientDecisions: z
			.array(recipeIngredientDecisionSchema)
			.min(scaledRecipe.ingredients.length)
			.max(scaledRecipe.ingredients.length + 12),
		steps: z.array(normalizedRecipeStepSchema).length(recipe.steps.length),
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
			'Use the scaled ingredient list as the baseline source of truth, but first judge per ingredient whether a change is necessary.',
			'Default to keep when the ingredient can stay as-is after servings scaling.',
			'Only change ingredients when necessary to satisfy servings, equipment, or constraints.',
			'Return ingredientDecisions for each baseline ingredient before producing final ingredients.',
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
			'- ingredientDecisions にはベース材料ごとに、変更が必要かどうかを必ず入れてください。',
			'- 変更不要なら needsChange=false, changeType=keep にしてください。',
			'- 人数換算だけで足りる場合は keep か scale を優先してください。',
			'- split / merge の場合は nextIngredientIds で対応先を示してください。',
			'- 各 step の id と order は入力と同じ値を返してください。',
			'- ingredients は最終的に採用する材料一覧にしてください。',
			'- text は最適化後の自然な手順文にしてください。',
			'- 加熱時間や火加減を変える場合は、人数・器具・制約に必要な差だけ反映してください。',
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

	const materialChanges = buildMaterialChangesFromDecisions({
		baseIngredients: scaledRecipe.ingredients,
		decisions: output.ingredientDecisions,
		optimizedIngredients: output.ingredients,
	});

	return {
		adjustedRecipe: {
			...scaledRecipe,
			description: output.description ?? scaledRecipe.description,
			ingredients: output.ingredients,
			steps: adjustedSteps,
		},
		ingredientDecisions: output.ingredientDecisions,
		materialChanges,
		stepChanges: output.stepChanges,
	};
};
