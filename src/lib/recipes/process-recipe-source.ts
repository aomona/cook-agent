import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { recipeSources } from '@/db/schema';
import type {
	NormalizedIngredient,
	NormalizedRecipe,
	NormalizedRecipeStep,
} from '@/lib/plans/types';
import { extractHtmlText } from '@/lib/recipes/extract-html-text';
import { summarizeRecipeSource } from '@/lib/recipes/summarize-recipe-source';

const getErrorMessage = (error: unknown): string => {
	if (error instanceof Error && error.message) {
		return error.message;
	}

	return 'Unknown processing error.';
};

const isPrivateIpv4 = (address: string): boolean => {
	const octets = address.split('.').map((segment) => Number.parseInt(segment, 10));

	if (octets.length !== 4 || octets.some((octet) => Number.isNaN(octet))) {
		return true;
	}

	if (octets[0] === 10 || octets[0] === 127) {
		return true;
	}

	if (octets[0] === 169 && octets[1] === 254) {
		return true;
	}

	if (octets[0] === 192 && octets[1] === 168) {
		return true;
	}

	return octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31;
};

const isPrivateIpv6 = (address: string): boolean => {
	const normalizedAddress = address.toLowerCase();

	if (normalizedAddress === '::1') {
		return true;
	}

	if (normalizedAddress.startsWith('::ffff:')) {
		return isPrivateIpAddress(normalizedAddress.slice(7));
	}

	if (normalizedAddress.startsWith('fc') || normalizedAddress.startsWith('fd')) {
		return true;
	}

	return (
		normalizedAddress.startsWith('fe8') ||
		normalizedAddress.startsWith('fe9') ||
		normalizedAddress.startsWith('fea') ||
		normalizedAddress.startsWith('feb')
	);
};

const isPrivateIpAddress = (address: string): boolean => {
	const ipVersion = isIP(address);

	if (ipVersion === 4) {
		return isPrivateIpv4(address);
	}

	if (ipVersion === 6) {
		return isPrivateIpv6(address);
	}

	return true;
};

const assertSafeRecipeUrl = async (value: string): Promise<URL> => {
	const url = new URL(value);

	if (!['http:', 'https:'].includes(url.protocol)) {
		throw new Error('HTTP または HTTPS のレシピ URL を入力してください。');
	}

	const hostname = url.hostname.toLowerCase();

	if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
		throw new Error('この URL は取得できません。');
	}

	if (isIP(hostname) !== 0) {
		if (isPrivateIpAddress(hostname)) {
			throw new Error('この URL は取得できません。');
		}

		return url;
	}

	const addresses = await lookup(hostname, { all: true, verbatim: true });

	if (addresses.some(({ address }) => isPrivateIpAddress(address))) {
		throw new Error('この URL は取得できません。');
	}

	return url;
};

const normalizeRecipe = ({
	title,
	summary,
	servingsText,
	ingredientsText,
	instructionsText,
}: {
	title: string;
	summary: string;
	servingsText?: string | null;
	ingredientsText: string[];
	instructionsText: string[];
}): NormalizedRecipe | undefined => {
	if (ingredientsText.length === 0 && instructionsText.length === 0) {
		return undefined;
	}

	const ingredients: NormalizedIngredient[] = ingredientsText.map((ingredient, index) => ({
		id: `ingredient-${index + 1}`,
		name: ingredient,
	}));

	const steps: NormalizedRecipeStep[] = instructionsText.map((instruction, index) => ({
		id: `step-${index + 1}`,
		order: index + 1,
		text: instruction,
	}));

	return {
		title,
		description: summary,
		servings: (() => {
			if (!servingsText) {
				return undefined;
			}

			const parsedServings = Number.parseInt(servingsText, 10);

			return Number.isNaN(parsedServings) ? undefined : parsedServings;
		})(),
		ingredients,
		steps,
	};
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
				normalizedRecipe: normalizeRecipe({
					title: recipeSummary.title,
					summary: recipeSummary.summary,
					servingsText: recipeSummary.servingsText,
					ingredientsText: recipeSummary.ingredientsText,
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
