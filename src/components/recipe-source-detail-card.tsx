'use client';

import {
	Badge,
	Button,
	Card,
	Flex,
	Heading,
	Link,
	Modal,
	Text,
	useDisclosure,
	VStack,
} from '@workspaces/ui';
import { formatIngredientLine, getRecipeProcessingLabel } from '@/lib/plans/presentation';
import type {
	NormalizedRecipe,
	RecipeAdjustmentStatus,
	RecipeMaterialChange,
	RecipeProcessingStatus,
	RecipeStepChange,
} from '@/lib/plans/types';

export type RecipeDetailItem = {
	id: string;
	type: 'url' | 'text';
	label: string;
	title: string | null;
	summary: string | null;
	processingStatus: RecipeProcessingStatus;
	normalizedRecipe: NormalizedRecipe | null;
	adjustedRecipe?: NormalizedRecipe | null;
	adjustedForServings?: number | null;
	baseServings?: number | null;
	adjustmentStatus?: RecipeAdjustmentStatus;
	adjustmentError?: string | null;
	adjustmentConfirmedAt?: string | null;
	materialChanges?: RecipeMaterialChange[];
	stepChanges?: RecipeStepChange[];
};

const getRecipeTitle = (recipe: RecipeDetailItem): string =>
	recipe.title ?? recipe.adjustedRecipe?.title ?? recipe.normalizedRecipe?.title ?? recipe.label;

const getStepChangeLabel = (value: RecipeStepChange['changeType']): string => {
	switch (value) {
		case 'batching':
			return '分割';
		case 'equipment':
			return '器具';
		case 'heat':
			return '火加減';
		case 'quantity':
			return '分量';
		case 'safety':
			return '安全';
		case 'sequence':
			return '順序';
		case 'time':
			return '時間';
		case 'wording':
			return '表現';
		default:
			return value;
	}
};

const getMaterialChangeLabel = (value: RecipeMaterialChange['changeType']): string => {
	switch (value) {
		case 'add':
			return '追加';
		case 'merge':
			return '統合';
		case 'remove':
			return '削除';
		case 'scale':
			return '分量調整';
		case 'split':
			return '分割';
		case 'substitute':
			return '置換';
		default:
			return value;
	}
};

const RecipeNormalizedSection = ({
	heading,
	recipe,
}: {
	heading: string;
	recipe: NormalizedRecipe;
}) => (
	<>
		<Card.Root variant="outline">
			<Card.Body gap="xs">
				<Heading size="sm">{heading}</Heading>
				<Text color="fg.subtle">人数: {recipe.servings ? `${recipe.servings}人分` : '未設定'}</Text>
			</Card.Body>
		</Card.Root>

		{recipe.ingredients.length > 0 ? (
			<Card.Root variant="outline">
				<Card.Body gap="xs">
					<Heading size="sm">材料</Heading>
					{recipe.ingredients.map((ingredient) => (
						<Text key={ingredient.id} whiteSpace="pre-wrap">
							・{formatIngredientLine(ingredient)}
						</Text>
					))}
				</Card.Body>
			</Card.Root>
		) : null}

		{recipe.steps.length > 0 ? (
			<Card.Root variant="outline">
				<Card.Body gap="sm">
					<Heading size="sm">手順</Heading>
					{recipe.steps.map((step) => (
						<VStack key={step.id} align="stretch" gap="xs">
							<Text color="fg.subtle" fontSize="sm">
								STEP {step.order}
							</Text>
							<Text whiteSpace="pre-wrap">{step.text}</Text>
						</VStack>
					))}
				</Card.Body>
			</Card.Root>
		) : null}
	</>
);

export const RecipeSourceDetailModal = ({
	open,
	recipe,
	onClose,
}: {
	open: boolean;
	recipe: RecipeDetailItem;
	onClose: () => void;
}) => {
	const recipeTitle = getRecipeTitle(recipe);

	return (
		<Modal.Root open={open} scrollBehavior="inside" size="xl" onClose={onClose}>
			<Modal.Overlay backdropFilter="blur(4px)" />
			<Modal.Content maxH="min(80vh, 48rem)" mx="md" w="calc(100% - 2rem)">
				<Modal.Header px="lg" pt="lg">
					<VStack align="stretch" gap="xs">
						<Flex align="center" gap="sm" wrap="wrap">
							<Badge colorScheme={recipe.type === 'url' ? 'blue' : 'amber'} variant="subtle">
								{recipe.type === 'url' ? 'URL' : 'TEXT'}
							</Badge>
							<Badge colorScheme="gray" variant="subtle">
								{getRecipeProcessingLabel(recipe.processingStatus)}
							</Badge>
							{recipe.adjustedForServings ? (
								<Badge colorScheme="green" variant="subtle">
									{recipe.adjustedForServings}人分向けに最適化済み
								</Badge>
							) : null}
							{recipe.adjustmentConfirmedAt ? (
								<Badge colorScheme="blue" variant="subtle">
									確認済み
								</Badge>
							) : null}
						</Flex>
						<Modal.Title>{recipeTitle}</Modal.Title>
					</VStack>
				</Modal.Header>

				<Modal.Body px="lg" py="md">
					<VStack align="stretch" gap="md">
						{recipe.summary ? (
							<Card.Root variant="outline">
								<Card.Body gap="xs">
									<Heading size="sm">要約</Heading>
									<Text whiteSpace="pre-wrap">{recipe.summary}</Text>
								</Card.Body>
							</Card.Root>
						) : null}

						<Card.Root variant="outline">
							<Card.Body gap="xs">
								<Heading size="sm">ソース</Heading>
								{recipe.type === 'url' ? (
									<Link
										href={recipe.label}
										overflowWrap="anywhere"
										rel="noreferrer"
										target="_blank"
										whiteSpace="pre-wrap"
									>
										{recipe.label}
									</Link>
								) : (
									<Text overflowWrap="anywhere" whiteSpace="pre-wrap">
										{recipe.label}
									</Text>
								)}
							</Card.Body>
						</Card.Root>

						{recipe.adjustedRecipe || recipe.normalizedRecipe ? (
							<>
								{recipe.adjustedRecipe ? (
									<RecipeNormalizedSection
										heading="最適化後のレシピ"
										recipe={recipe.adjustedRecipe}
									/>
								) : null}

								{recipe.materialChanges && recipe.materialChanges.length > 0 ? (
									<Card.Root variant="outline">
										<Card.Body gap="xs">
											<Heading size="sm">変更された材料</Heading>
											{recipe.materialChanges.map((change) => (
												<Text
													key={`${change.changeType}-${change.ingredientId ?? 'new'}-${change.nextIngredientId ?? 'same'}-${change.reason}`}
													color="fg.subtle"
													fontSize="sm"
												>
													{getMaterialChangeLabel(change.changeType)}: {change.ingredientName}
													{change.nextIngredientName ? ` -> ${change.nextIngredientName}` : ''} -{' '}
													{change.reason}
												</Text>
											))}
										</Card.Body>
									</Card.Root>
								) : null}

								{recipe.stepChanges && recipe.stepChanges.length > 0 ? (
									<Card.Root variant="outline">
										<Card.Body gap="xs">
											<Heading size="sm">AI が調整したポイント</Heading>
											{recipe.stepChanges.map((change) => (
												<Text
													key={`${change.stepId}-${change.changeType}`}
													color="fg.subtle"
													fontSize="sm"
												>
													STEP {change.stepId}: {getStepChangeLabel(change.changeType)} -{' '}
													{change.reason}
												</Text>
											))}
										</Card.Body>
									</Card.Root>
								) : null}

								{recipe.adjustmentError ? (
									<Text color="danger">{recipe.adjustmentError}</Text>
								) : null}

								{recipe.normalizedRecipe ? (
									<RecipeNormalizedSection
										heading={recipe.adjustedRecipe ? '元レシピ' : '抽出レシピ'}
										recipe={recipe.normalizedRecipe}
									/>
								) : null}
							</>
						) : (
							<Text color="fg.subtle">
								まだ構造化レシピがありません。抽出完了後に詳細を表示できます。
							</Text>
						)}
					</VStack>
				</Modal.Body>

				<Modal.Footer px="lg" pb="lg" pt="sm">
					<Button onClick={onClose} variant="ghost">
						閉じる
					</Button>
				</Modal.Footer>
			</Modal.Content>
		</Modal.Root>
	);
};

export const RecipeSourceDetailCard = ({ recipe }: { recipe: RecipeDetailItem }) => {
	const { open, onClose, onOpen } = useDisclosure();
	const recipeTitle = getRecipeTitle(recipe);

	return (
		<>
			<Card.Root
				cursor="pointer"
				role="button"
				tabIndex={0}
				transition="background-color 0.2s ease, transform 0.2s ease"
				variant="outline"
				_hover={{ bg: 'bg.subtle', transform: 'translateY(-1px)' }}
				onClick={onOpen}
				onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						onOpen();
					}
				}}
			>
				<Card.Body gap="sm">
					<Flex align="start" justify="space-between" gap="sm" wrap="wrap">
						<Badge colorScheme={recipe.type === 'url' ? 'blue' : 'amber'} variant="subtle">
							{recipe.type === 'url' ? 'URL' : 'TEXT'}
						</Badge>
						<Text color="fg.subtle">{getRecipeProcessingLabel(recipe.processingStatus)}</Text>
					</Flex>
					<Heading size="md">{recipeTitle}</Heading>
					{recipe.summary ? <Text whiteSpace="pre-wrap">{recipe.summary}</Text> : null}
					<Text color="fg.subtle" fontSize="sm">
						クリックでレシピ詳細を見る
					</Text>
				</Card.Body>
			</Card.Root>

			<RecipeSourceDetailModal open={open} recipe={recipe} onClose={onClose} />
		</>
	);
};
