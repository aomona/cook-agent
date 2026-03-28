import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { recipeSources } from '@/db/schema';
import { assertSafePublicHttpUrl } from '@/lib/network/safe-url';
import { syncAdjustedRecipesForLinkedSource } from '@/lib/recipes/adjust-plan-recipes';
import { extractHtmlText } from '@/lib/recipes/extract-html-text';
import { normalizeRecipeSummary } from '@/lib/recipes/normalize-recipe-summary';
import { summarizeRecipeSource } from '@/lib/recipes/summarize-recipe-source';

const getErrorMessage = (error: unknown): string => {
	if (error instanceof Error && error.message) {
		return error.message;
	}

	return 'Unknown processing error.';
};

const assertSafeRecipeUrl = async (value: string): Promise<URL> => {
	return assertSafePublicHttpUrl(value, {
		invalidProtocolMessage: 'HTTP または HTTPS のレシピ URL を入力してください。',
	});
};

const fetchSourceTextFromUrl = async (url: string): Promise<string> => {
	const safeUrl = await assertSafeRecipeUrl(url);
	const response = await fetch(safeUrl, {
		cache: 'no-store',
		headers: {
			'User-Agent': 'cook-agent/0.1',
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch recipe URL (${response.status}).`);
	}

	const html = await response.text();
	const extractedText = extractHtmlText(html);

	if (!extractedText) {
		throw new Error('The recipe page did not contain readable text.');
	}

	return extractedText;
};

export const processRecipeSource = async (
	recipeSourceId: string,
	options?: {
		sourceText?: string;
	},
): Promise<void> => {
	const [recipeSource] = await db
		.update(recipeSources)
		.set({
			processingStatus: 'processing',
			processingError: null,
		})
		.where(
			and(
				eq(recipeSources.id, recipeSourceId),
				inArray(recipeSources.processingStatus, ['queued', 'failed']),
			),
		)
		.returning({
			id: recipeSources.id,
			sourceType: recipeSources.sourceType,
			sourceUrl: recipeSources.sourceUrl,
			rawContent: recipeSources.rawContent,
		});

	if (!recipeSource) {
		return;
	}

	try {
		const sourceText =
			recipeSource.sourceType === 'url'
				? await fetchSourceTextFromUrl(recipeSource.sourceUrl ?? '')
				: (options?.sourceText?.trim() ?? recipeSource.rawContent.inputText?.trim() ?? '');

		if (!sourceText) {
			throw new Error('レシピテキストが見つかりません。再入力してください。');
		}

		const recipeSummary = await summarizeRecipeSource({
			inputMode: recipeSource.sourceType === 'url' ? 'url' : 'text',
			text: sourceText,
			url: recipeSource.sourceUrl ?? undefined,
		});

		const nextRawContent = {
			...(recipeSource.sourceType === 'manual'
				? {
						inputText: recipeSource.rawContent.inputText ?? options?.sourceText?.trim(),
					}
				: {}),
			title: recipeSummary.title,
			description: recipeSummary.summary,
			servingsText: recipeSummary.servingsText,
			ingredientsText: recipeSummary.ingredientsText,
			materials: recipeSummary.materials,
			instructionsText: recipeSummary.instructionsText,
		};

		await db
			.update(recipeSources)
			.set({
				title: recipeSummary.title,
				description: recipeSummary.summary,
				summary: recipeSummary.summary,
				servingsText: recipeSummary.servingsText ?? null,
				rawContent: nextRawContent,
				normalizedRecipe: normalizeRecipeSummary({
					title: recipeSummary.title,
					summary: recipeSummary.summary,
					servingsText: recipeSummary.servingsText,
					ingredientsText: recipeSummary.ingredientsText,
					materials: recipeSummary.materials,
					instructionsText: recipeSummary.instructionsText,
				}),
				fetchedAt: recipeSource.sourceType === 'url' ? new Date() : null,
				processingStatus: 'completed',
				processingError: null,
			})
			.where(eq(recipeSources.id, recipeSourceId));
	} catch (error) {
		await db
			.update(recipeSources)
			.set({
				processingStatus: 'failed',
				processingError: getErrorMessage(error),
			})
			.where(eq(recipeSources.id, recipeSourceId));
	}
};

export const processRecipeSourceAndSyncPlans = async (
	recipeSourceId: string,
	options?: {
		sourceText?: string;
	},
): Promise<void> => {
	await processRecipeSource(recipeSourceId, options);
	await syncAdjustedRecipesForLinkedSource(recipeSourceId);
};
