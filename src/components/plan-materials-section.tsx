import { Card, Heading, Text, VStack } from '@workspaces/ui';
import type { PlanDocument } from '@/lib/plans/types';

export const PlanMaterialsSection = ({
	plan,
	recipeTitleById,
}: {
	plan: PlanDocument;
	recipeTitleById: Record<string, string>;
}) => {
	if (plan.materials.length === 0) {
		return null;
	}

	const materialsByRecipe = new Map<string, PlanDocument['materials']>();

	for (const material of plan.materials) {
		const key = material.recipeSourceId ?? 'shared';
		const current = materialsByRecipe.get(key) ?? [];
		current.push(material);
		materialsByRecipe.set(key, current);
	}

	return (
		<VStack align="stretch" gap="md">
			<Heading size="md">材料一覧</Heading>
			{Array.from(materialsByRecipe.entries()).map(([recipeSourceId, materials]) => (
				<Card.Root key={recipeSourceId} variant="outline">
					<Card.Body gap="sm">
						<Heading size="sm">
							{recipeSourceId === 'shared'
								? '共通材料'
								: (recipeTitleById[recipeSourceId] ?? recipeSourceId)}
						</Heading>
						{materials.map((material) => (
							<Text key={material.id} whiteSpace="pre-wrap">
								・{material.name}
								{material.amount ? ` (${material.amount})` : ''}
							</Text>
						))}
					</Card.Body>
				</Card.Root>
			))}
		</VStack>
	);
};
