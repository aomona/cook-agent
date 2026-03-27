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

type QuantityLike = Pick<
	NormalizedIngredient,
	'amount' | 'amountMax' | 'amountMin' | 'amountValue' | 'unit'
>;

export const formatStructuredAmount = (ingredient: QuantityLike): string | undefined => {
	if (typeof ingredient.amountValue === 'number') {
		return `${formatScaledNumber(ingredient.amountValue)}${ingredient.unit ?? ''}`;
	}

	if (typeof ingredient.amountMin === 'number' && typeof ingredient.amountMax === 'number') {
		return `${formatScaledNumber(ingredient.amountMin)}~${formatScaledNumber(ingredient.amountMax)}${ingredient.unit ?? ''}`;
	}

	return ingredient.amount;
};

export const formatIngredientLine = (ingredient: NormalizedIngredient): string => {
	const suffix = [formatStructuredAmount(ingredient), ingredient.preparation]
		.filter(Boolean)
		.join(' / ');

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

const normalizeNumericToken = (token: string): string =>
	token
		.replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
		.replace(/．/g, '.')
		.replace(/／/g, '/');

const parseNumericToken = (token: string): number | null => {
	const normalizedToken = normalizeNumericToken(token).trim();

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

const scaleQuantityExpression = (expression: string, scaleFactor: number): string => {
	const rangeMatch = expression.match(/^(.*?)(\s*[〜~]\s*)(.*)$/);

	if (rangeMatch) {
		const [, leftSide, separator, rightSide] = rangeMatch;
		const leftValue = parseNumericToken(leftSide);
		const rightValue = parseNumericToken(rightSide);

		if (leftValue === null || rightValue === null) {
			return expression;
		}

		return `${formatScaledNumber(leftValue * scaleFactor)}${separator}${formatScaledNumber(rightValue * scaleFactor)}`;
	}

	const parsedValue = parseNumericToken(expression);

	if (parsedValue === null) {
		return expression;
	}

	return formatScaledNumber(parsedValue * scaleFactor);
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
	const scaledStructuredAmount = (() => {
		if (typeof ingredient.amountValue === 'number') {
			return `${formatScaledNumber(ingredient.amountValue * scaleFactor)}${ingredient.unit ?? ''}`;
		}

		if (typeof ingredient.amountMin === 'number' && typeof ingredient.amountMax === 'number') {
			return `${formatScaledNumber(ingredient.amountMin * scaleFactor)}~${formatScaledNumber(ingredient.amountMax * scaleFactor)}${ingredient.unit ?? ''}`;
		}

		return null;
	})();

	if (scaledStructuredAmount) {
		return formatIngredientLine({
			...ingredient,
			amount: scaledStructuredAmount,
			amountMax: undefined,
			amountMin: undefined,
			amountValue: undefined,
			unit: undefined,
		});
	}

	return line.replace(
		/[0-9０-９]+(?:\s+[0-9０-９]+\/[0-9０-９]+|\/[0-9０-９]+|\.[0-9０-９]+)?(?:\s*[〜~]\s*[0-9０-９]+(?:\s+[0-9０-９]+\/[0-9０-９]+|\/[0-9０-９]+|\.[0-9０-９]+)?)?/g,
		(token) => scaleQuantityExpression(token, scaleFactor),
	);
};
