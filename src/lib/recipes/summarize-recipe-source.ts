import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { getRequiredEnv } from '@/lib/env';
import type {
	RecipeSourceMaterialAmountSummary,
	RecipeSourceMaterialSummary,
} from '@/lib/plans/types';

const openai = createOpenAI({
	apiKey: getRequiredEnv('OPENAI_API_KEY'),
});

const recipeSourceMaterialAmountSummarySchema = z
	.object({
		text: z.string().trim().min(1).max(120).nullable(),
		value: z.number().positive().max(100000).nullable(),
		min: z.number().positive().max(100000).nullable(),
		max: z.number().positive().max(100000).nullable(),
		unit: z.string().trim().min(1).max(40).nullable(),
	})
	.superRefine((value, context) => {
		if (
			value.value === null &&
			value.min === null &&
			value.max === null &&
			value.unit === null &&
			value.text === null
		) {
			return;
		}

		if (value.value !== null && (value.min !== null || value.max !== null)) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'Use either value or min/max for amount, not both.',
			});
		}

		if ((value.min === null) !== (value.max === null)) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'Amount ranges must include both min and max.',
			});
		}
	}) satisfies z.ZodType<RecipeSourceMaterialAmountSummary>;

const recipeSourceMaterialSummarySchema = z.object({
	rawLine: z.string().trim().min(1).max(200).nullable(),
	name: z.string().trim().min(1).max(120),
	amount: recipeSourceMaterialAmountSummarySchema.nullable(),
	preparation: z.string().trim().min(1).max(120).nullable(),
	optional: z.boolean().nullable(),
}) satisfies z.ZodType<RecipeSourceMaterialSummary>;

const recipeSummarySchema = z.object({
	title: z.string().trim().min(1).max(120),
	summary: z.string().trim().min(1).max(240),
	servingsText: z.string().trim().max(60).nullable(),
	ingredientsText: z.array(z.string().trim().min(1).max(200)).max(30),
	materials: z.array(recipeSourceMaterialSummarySchema).max(30),
	instructionsText: z.array(z.string().trim().min(1).max(300)).max(30),
});

export type RecipeSummaryResult = z.infer<typeof recipeSummarySchema>;

const truncateForModel = (value: string, maxLength = 18000): string => {
	if (value.length <= maxLength) {
		return value;
	}

	return value.slice(0, maxLength);
};

export const summarizeRecipeSource = async ({
	inputMode,
	text,
	url,
}: {
	inputMode: 'url' | 'text';
	text: string;
	url?: string;
}): Promise<RecipeSummaryResult> => {
	const { output: recipeSummary } = await generateText({
		model: openai('gpt-5.4-nano'),
		system: [
			'You summarize recipe sources for a cooking-planning prototype.',
			'Return structured JSON that a later AI can reuse.',
			'Do not invent missing facts.',
			'Prefer concise Japanese output.',
			'When servings are unknown, set servingsText to null.',
			'If servings are ambiguous, conflicting, or only weakly implied, set servingsText to null instead of guessing.',
			'When servings are missing or ambiguous, the product will ask the user to enter them manually.',
			'Always include ingredientsText, materials, and instructionsText.',
			'Use materials to separate ingredient name from amount and preparation whenever possible.',
			'For amounts, prefer structured numeric output: use amount.value for exact numbers and amount.min/amount.max for ranges.',
			'Example: 1/2個 -> amount { text: "1/2個", value: 0.5, unit: "個" }.',
			'Example: 1~2人前 -> amount { text: "1~2人前", min: 1, max: 2, unit: "人前" }.',
			'When amount is unknown, set amount to null instead of guessing.',
			'When preparation is unknown, set preparation to null.',
			'When the item is optional, garnish, or amount is clearly to taste, set optional to true.',
			'Do not put quantities or preparation words inside materials.name unless separation is impossible.',
			'Preserve the original ingredient line in rawLine when practical.',
			'If ingredients or steps are unclear, return an empty array instead of guessing.',
		].join(' '),
		prompt: [
			`Input mode: ${inputMode}`,
			url ? `Source URL: ${url}` : undefined,
			'The following text came from user input or from HTML with tags removed.',
			'Extract a short title, a practical summary, servings text if available, ingredient lines, structured materials, and instruction lines.',
			'Example material: {"rawLine":"玉ねぎ 1/2個 薄切り","name":"玉ねぎ","amount":{"text":"1/2個","value":0.5,"min":null,"max":null,"unit":"個"},"preparation":"薄切り","optional":null}',
			'Range example: {"rawLine":"ソース 1~2人前","name":"ソース","amount":{"text":"1~2人前","value":null,"min":1,"max":2,"unit":"人前"},"preparation":null,"optional":null}',
			'',
			truncateForModel(text),
		]
			.filter(Boolean)
			.join('\n'),
		output: Output.object({
			schema: recipeSummarySchema,
			name: 'recipe_summary',
			description: 'Concise structured summary of a recipe source.',
		}),
		providerOptions: {
			openai: {
				reasoningEffort: 'low',
				textVerbosity: 'low',
			},
		},
	});

	return recipeSummary;
};
