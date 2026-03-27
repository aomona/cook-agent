'use client';

import { Button, Flex, Status, Text } from '@workspaces/ui';
import { AppSpinner } from '@/components/app-spinner';
import type { CreateRecipeItem } from '@/lib/create-session';

const pendingStatuses = new Set(['queued', 'processing', 'adjusting', 'idle']);

const isTemporaryRecipeId = (recipeId: string): boolean => recipeId.startsWith('temp-');

export const isPendingRecipe = (recipe: CreateRecipeItem): boolean =>
	(recipe.processingStatus !== 'failed' && pendingStatuses.has(recipe.processingStatus)) ||
	(recipe.processingStatus === 'completed' &&
		!recipe.requiresServingsInput &&
		pendingStatuses.has(recipe.adjustmentStatus));

export const isTemporaryCreateRecipeId = isTemporaryRecipeId;

export const RecipeStatus = ({
	recipe,
	onRetry,
}: {
	recipe: CreateRecipeItem;
	onRetry: (recipeId: string) => void;
}) => {
	if (recipe.processingStatus === 'completed' && recipe.adjustmentStatus === 'completed') {
		return <Status value="success">人数反映済み</Status>;
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

	if (recipe.processingStatus === 'completed' && recipe.requiresServingsInput) {
		return (
			<Text color="fg.subtle" fontSize="sm">
				元人数の入力待ち
			</Text>
		);
	}

	if (recipe.processingStatus === 'completed' && recipe.adjustmentStatus === 'action_required') {
		return <Status value="error">人数反映に要対応</Status>;
	}

	if (recipe.processingStatus === 'completed' && recipe.adjustmentStatus === 'adjusting') {
		return (
			<Flex align="center" color="fg.subtle" gap="sm">
				<AppSpinner />
				<Text fontSize="sm">人数に合わせて手順を調整中...</Text>
			</Flex>
		);
	}

	if (recipe.processingStatus === 'completed' && recipe.adjustmentStatus === 'idle') {
		return (
			<Flex align="center" color="fg.subtle" gap="sm">
				<AppSpinner />
				<Text fontSize="sm">人数反映を準備中...</Text>
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
