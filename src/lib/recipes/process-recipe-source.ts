import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { recipeSources } from '@/db/schema';
import { fetchSafePublicText } from '@/lib/network/safe-url';
import { syncAdjustedRecipesForLinkedSource } from '@/lib/recipes/adjust-plan-recipes';
import { extractHtmlText } from '@/lib/recipes/extract-html-text';
import { normalizeRecipeSummary } from '@/lib/recipes/normalize-recipe-summary';
import { summarizeRecipeSource } from '@/lib/recipes/summarize-recipe-source';

const genericProcessingErrorMessage =
	'レシピの処理に失敗しました。しばらくしてからもう一度お試しください。';

const knownProcessingErrorMessages = new Set([
	'HTTP または HTTPS のレシピ URL を入力してください。',
	'この URL は取得できません。',
	'この URL は取得できません。別の URL を入力してください。',
	'この URL には無効なリダイレクトが含まれています。',
	'取得したページが大きすぎます。別の URL を試してください。',
	'URL の取得がタイムアウトしました。',
	'レシピ URL の取得に失敗しました。ページを確認してください。',
	'レシピページから本文を読み取れませんでした。',
	'レシピテキストが見つかりません。再入力してください。',
]);

const getErrorMessage = (error: unknown): string => {
	if (error instanceof Error && knownProcessingErrorMessages.has(error.message)) {
		return error.message;
	}

	return genericProcessingErrorMessage;
};

const fetchSourceTextFromUrl = async (url: string): Promise<string> => {
	const { response, text } = await fetchSafePublicText(url, {
		blockedMessage: 'この URL は取得できません。別の URL を入力してください。',
		headers: {
			'User-Agent': 'cook-agent/0.1',
		},
		invalidProtocolMessage: 'HTTP または HTTPS のレシピ URL を入力してください。',
		invalidRedirectMessage: 'この URL には無効なリダイレクトが含まれています。',
		timeoutMessage: 'URL の取得がタイムアウトしました。',
		tooLargeMessage: '取得したページが大きすぎます。別の URL を試してください。',
	});

	if (!response.ok) {
		throw new Error('レシピ URL の取得に失敗しました。ページを確認してください。');
	}

	const extractedText = extractHtmlText(text);

	if (!extractedText) {
		throw new Error('レシピページから本文を読み取れませんでした。');
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
