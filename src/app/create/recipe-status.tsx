'use client';

import { Button, Flex, Status, Text } from '@workspaces/ui';
import { AppSpinner } from '@/components/app-spinner';
import type { CreateRecipeItem } from '@/lib/create-session';

const pendingStatuses = new Set(['queued', 'processing']);

const isTemporaryRecipeId = (recipeId: string): boolean => recipeId.startsWith('temp-');

export const isPendingRecipe = (recipe: CreateRecipeItem): boolean =>
	pendingStatuses.has(recipe.processingStatus);

export const isTemporaryCreateRecipeId = isTemporaryRecipeId;

export const RecipeStatus = ({
	recipe,
	onRetry,
}: {
	recipe: CreateRecipeItem;
	onRetry: (recipeId: string) => void;
}) => {
	if (recipe.processingStatus === 'completed') {
		return <Status value="success">抽出完了</Status>;
	}

	if (recipe.processingStatus === 'failed') {
		return (
			<Flex align="center" gap="sm" wrap="wrap">
				<Status value="error">抽出に失敗しました</Status>
				{isTemporaryRecipeId(recipe.id) ? null : (
					<Button size="sm" variant="ghost" onClick={() => onRetry(recipe.id)}>
						再試行
					</Button>
				)}
			</Flex>
		);
	}

	return (
		<Flex align="center" color="fg.subtle" gap="sm">
			<AppSpinner />
			<Text fontSize="sm">レシピを抽出中...</Text>
		</Flex>
	);
};
