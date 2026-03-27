import type { NormalizedIngredient, RecipeProcessingStatus } from '@/lib/plans/types';

export const formatPlanDateTime = (value: string): string =>
	new Intl.DateTimeFormat('ja-JP', {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
	}).format(new Date(value));

export const getPlanStatusColorScheme = (status: 'draft' | 'ready' | 'archived'): string => {
	if (status === 'ready') return 'green';
	if (status === 'archived') return 'gray';

	return 'blue';
};

export const getPlanStatusLabel = (status: 'draft' | 'ready' | 'archived'): string => {
	if (status === 'ready') return 'READY';
	if (status === 'archived') return 'ARCHIVED';

	return 'DRAFT';
};

export const getRecipeProcessingLabel = (status: RecipeProcessingStatus): string => {
	if (status === 'completed') return '抽出完了';
	if (status === 'failed') return '抽出失敗';
	if (status === 'queued') return '抽出待機中';

	return '抽出中';
};

export const formatIngredientLine = (ingredient: NormalizedIngredient): string => {
	const suffix = [ingredient.amount, ingredient.preparation].filter(Boolean).join(' / ');

	if (!suffix) {
		return ingredient.name;
	}

	return `${ingredient.name} (${suffix})`;
};

const formatScaledNumber = (value: number): string => {
	if (Number.isInteger(value)) {
		return String(value);
	}

	const rounded = Math.round(value * 100) / 100;

	return rounded.toFixed(2).replace(/\.?0+$/, '');
};

const parseNumericToken = (token: string): number | null => {
	const normalizedToken = token.trim();

	if (/^\d+\s+\d+\/\d+$/.test(normalizedToken)) {
		const [wholePart, fractionPart] = normalizedToken.split(/\s+/, 2);
		const [numerator, denominator] = fractionPart?.split('/', 2).map(Number) ?? [];

		if (!wholePart || !numerator || !denominator) {
			return null;
		}

		return Number(wholePart) + numerator / denominator;
	}

	if (/^\d+\/\d+$/.test(normalizedToken)) {
		const [numerator, denominator] = normalizedToken.split('/', 2).map(Number);

		if (!numerator || !denominator) {
			return null;
		}

		return numerator / denominator;
	}

	const parsedNumber = Number(normalizedToken);

	return Number.isFinite(parsedNumber) ? parsedNumber : null;
};

export const scaleIngredientLine = ({
	baseServings,
	ingredient,
	requestedServings,
}: {
	ingredient: NormalizedIngredient;
	baseServings?: number;
	requestedServings: number;
}): string => {
	const line = formatIngredientLine(ingredient);

	if (
		!baseServings ||
		baseServings <= 0 ||
		requestedServings <= 0 ||
		baseServings === requestedServings
	) {
		return line;
	}

	const scaleFactor = requestedServings / baseServings;

	return line.replace(/\d+(?:\s+\d+\/\d+|\/\d+|\.\d+)?/g, (token) => {
		const parsedNumber = parseNumericToken(token);

		if (parsedNumber === null) {
			return token;
		}

		return formatScaledNumber(parsedNumber * scaleFactor);
	});
};
