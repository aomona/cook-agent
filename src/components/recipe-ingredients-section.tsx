import { Card, Heading, Text, VStack } from '@workspaces/ui';
import { scaleIngredientLine } from '@/lib/plans/presentation';
import type { NormalizedIngredient } from '@/lib/plans/types';

type RecipeIngredientSectionItem = {
	baseServings?: number;
	id: string;
	ingredients: NormalizedIngredient[];
	requestedServings: number;
	title: string;
};

export const RecipeIngredientsSection = ({
	recipes,
}: {
	recipes: RecipeIngredientSectionItem[];
}) => {
	if (recipes.length === 0) {
		return null;
	}

	return (
		<VStack align="stretch" gap="md">
			<Heading size="md">材料一覧</Heading>
			{recipes.map((recipe) => (
				<Card.Root key={recipe.id} variant="outline">
					<Card.Body gap="sm">
						<Heading size="sm">{recipe.title}</Heading>
						{recipe.ingredients.map((ingredient) => (
							<Text key={ingredient.id} whiteSpace="pre-wrap">
								・
								{scaleIngredientLine({
									baseServings: recipe.baseServings,
									ingredient,
									requestedServings: recipe.requestedServings,
								})}
							</Text>
						))}
					</Card.Body>
				</Card.Root>
			))}
		</VStack>
	);
};
