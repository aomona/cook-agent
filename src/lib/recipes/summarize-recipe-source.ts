import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { z } from 'zod';
import { getRequiredEnv } from '@/lib/env';

const openai = createOpenAI({
	apiKey: getRequiredEnv('OPENAI_API_KEY'),
});

const recipeSummarySchema = z.object({
	title: z.string().trim().min(1).max(120),
	summary: z.string().trim().min(1).max(240),
	servingsText: z.string().trim().max(60).nullable(),
	ingredientsText: z.array(z.string().trim().min(1).max(200)).max(30),
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
			'Always include ingredientsText and instructionsText.',
			'If ingredients or steps are unclear, return an empty array instead of guessing.',
		].join(' '),
		prompt: [
			`Input mode: ${inputMode}`,
			url ? `Source URL: ${url}` : undefined,
			'The following text came from user input or from HTML with tags removed.',
			'Extract a short title, a practical summary, servings text if available, ingredient lines, and instruction lines.',
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
