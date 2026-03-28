import 'server-only';

import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { getRequiredEnv } from '@/lib/env';
import { formatIngredientLine, scalePlanMaterial } from '@/lib/plans/presentation';
import type {
	NormalizedIngredient,
	NormalizedRecipe,
	NormalizedRecipeStep,
	RecipeStepChange,
} from '@/lib/plans/types';

const openai = createOpenAI({
	apiKey: getRequiredEnv('OPENAI_API_KEY'),
});

const stepChangeTypeValues = [
	'quantity',
	'heat',
	'time',
	'batching',
	'equipment',
	'sequence',
	'safety',
	'wording',
] as const;
const confidenceValues = ['low', 'medium', 'high'] as const;

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

const buildStepsReference = (steps: NormalizedRecipeStep[]): string[] =>
	steps.map((step) => `- ${step.id} | STEP ${step.order} | ${step.text}`);

export const adaptRecipeServings = async ({
	baseServings,
	recipe,
	targetServings,
}: {
	baseServings: number;
	recipe: NormalizedRecipe;
	targetServings: number;
}): Promise<{
	adjustedRecipe: NormalizedRecipe;
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

	if (baseServings === targetServings) {
		return {
			adjustedRecipe: scaledRecipe,
			stepChanges: [],
		};
	}

	const stepSchema = z.object({
		id: z.string().trim().min(1).max(120),
		order: z.number().int().positive().max(200),
		text: z.string().trim().min(1).max(500),
		notes: z.array(z.string().trim().min(1).max(200)).max(4).nullable(),
	});
	const outputSchema = z.object({
		description: z.string().trim().min(1).max(240).nullable(),
		steps: z.array(stepSchema).length(recipe.steps.length),
		stepChanges: z
			.array(
				z.object({
					stepId: z.string().trim().min(1).max(120),
					changeType: z.enum(stepChangeTypeValues),
					reason: z.string().trim().min(1).max(240),
					confidence: z.enum(confidenceValues),
				}),
			)
			.max(recipe.steps.length * 3),
	});

	const { output } = await generateText({
		model: openai('gpt-5.4-mini'),
		system: [
			'You rewrite recipe steps for a cooking-planning prototype after servings change.',
			'All human-readable output must be concise natural Japanese.',
			'Keep the same number of steps and preserve each step id and order exactly as provided.',
			'You may rewrite wording inside each step to reflect changed quantities, batch count, heating time, fire level, cookware usage, and pacing.',
			'Do not add or remove ingredients.',
			'Do not invent advanced techniques or safety-critical claims that are not implied by the original recipe.',
			'If you are uncertain whether heating time or fire level should change, stay conservative and keep the original intent.',
			'Use the scaled ingredient list as the source of truth for quantities.',
			'Return stepChanges only for meaningful changes.',
		].join(' '),
		prompt: [
			`元人数: ${baseServings}人分`,
			`目標人数: ${targetServings}人分`,
			`レシピ名: ${recipe.title}`,
			recipe.description ? `レシピ要約: ${recipe.description}` : undefined,
			'',
			'人数変更後の材料:',
			...buildIngredientReference(scaledRecipe.ingredients),
			'',
			'元の手順:',
			...buildStepsReference(recipe.steps),
			'',
			'出力ルール:',
			'- 各 step の id と order は入力と同じ値を返してください。',
			'- text は人数変更後の自然な手順文にしてください。',
			'- 加熱時間や火加減を変える場合は、人数変更により必要な差だけ反映してください。',
			'- notes は必要な補足がある時だけ返してください。',
			'- description は人数変更後に補足したい要約があれば返し、不要なら null にしてください。',
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

	return {
		adjustedRecipe: {
			...scaledRecipe,
			description: output.description ?? scaledRecipe.description,
			steps: adjustedSteps,
		},
		stepChanges: output.stepChanges,
	};
};
