import type {
	NormalizedIngredient,
	NormalizedRecipe,
	NormalizedRecipeStep,
	RecipeSourceMaterialAmountSummary,
	RecipeSourceMaterialSummary,
} from '@/lib/plans/types';

const formatNumericAmount = (value: number): string => {
	if (Number.isInteger(value)) {
		return String(value);
	}

	const rounded = Math.round(value * 100) / 100;

	return rounded
		.toFixed(2)
		.replace(/\.0+$/, '')
		.replace(/(\.\d*?)0+$/, '$1');
};

const formatAmountSummary = (
	amount?: RecipeSourceMaterialAmountSummary | null,
): string | undefined => {
	if (!amount) {
		return undefined;
	}

	if (amount.text) {
		return amount.text;
	}

	if (typeof amount.value === 'number') {
		return `${formatNumericAmount(amount.value)}${amount.unit ?? ''}`;
	}

	if (typeof amount.min === 'number' && typeof amount.max === 'number') {
		return `${formatNumericAmount(amount.min)}~${formatNumericAmount(amount.max)}${amount.unit ?? ''}`;
	}

	return undefined;
};

const normalizeIngredientFromMaterial = ({
	index,
	material,
}: {
	index: number;
	material: RecipeSourceMaterialSummary;
}): NormalizedIngredient => ({
	id: `ingredient-${index + 1}`,
	name: material.name,
	amount: formatAmountSummary(material.amount),
	amountValue: material.amount?.value ?? undefined,
	amountMin: material.amount?.min ?? undefined,
	amountMax: material.amount?.max ?? undefined,
	unit: material.amount?.unit ?? undefined,
	preparation: material.preparation ?? undefined,
	optional: material.optional ?? undefined,
});

const parseServings = (servingsText?: string | null): number | undefined => {
	if (!servingsText) {
		return undefined;
	}

	const normalized = servingsText
		.replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
		.replace(/／/g, '/')
		.replace(/〜/g, '~');

	if (/\d\s*[~-]\s*\d/.test(normalized)) {
		return undefined;
	}

	const parsedServings = Number.parseInt(normalized, 10);

	return Number.isNaN(parsedServings) ? undefined : parsedServings;
};

export const buildNormalizedIngredients = ({
	ingredientsText,
	materials,
}: {
	ingredientsText: string[];
	materials: RecipeSourceMaterialSummary[];
}): NormalizedIngredient[] => {
	if (materials.length > 0) {
		return materials.map((material, index) =>
			normalizeIngredientFromMaterial({
				index,
				material,
			}),
		);
	}

	return ingredientsText.map((ingredient, index) => ({
		id: `ingredient-${index + 1}`,
		name: ingredient,
	}));
};

export const normalizeRecipeSummary = ({
	title,
	summary,
	servingsText,
	ingredientsText,
	materials,
	instructionsText,
}: {
	title: string;
	summary: string;
	servingsText?: string | null;
	ingredientsText: string[];
	materials: RecipeSourceMaterialSummary[];
	instructionsText: string[];
}): NormalizedRecipe | undefined => {
	if (ingredientsText.length === 0 && materials.length === 0 && instructionsText.length === 0) {
		return undefined;
	}

	const ingredients = buildNormalizedIngredients({
		ingredientsText,
		materials,
	});
	const steps: NormalizedRecipeStep[] = instructionsText.map((instruction, index) => ({
		id: `step-${index + 1}`,
		order: index + 1,
		text: instruction,
	}));

	return {
		title,
		description: summary,
		servings: parseServings(servingsText),
		ingredients,
		steps,
	};
};
