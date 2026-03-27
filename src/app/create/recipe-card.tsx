'use client';

import {
	Badge,
	Button,
	Card,
	Flex,
	Heading,
	Input,
	Link,
	Text,
	useDisclosure,
} from '@workspaces/ui';
import { RecipeSourceDetailModal } from '@/components/recipe-source-detail-card';
import type { CreateRecipeItem } from '@/lib/create-session';
import { isTemporaryCreateRecipeId, RecipeStatus } from './recipe-status';

export const RecipeCard = ({
	recipe,
	deleting,
	savingServings,
	servingsValue,
	onDelete,
	onRetry,
	onSaveServings,
	onServingsChange,
}: {
	recipe: CreateRecipeItem;
	deleting: boolean;
	savingServings: boolean;
	servingsValue: string;
	onDelete: (recipeId: string) => void;
	onRetry: (recipeId: string) => void;
	onSaveServings: (recipeId: string) => void;
	onServingsChange: (recipeId: string, value: string) => void;
}) => {
	const { open, onClose, onOpen } = useDisclosure();

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
					<Flex align="center" w="full" gap="sm" justify="space-between">
						<Flex align="center" gap="sm" wrap="wrap">
							<Badge colorScheme={recipe.type === 'url' ? 'blue' : 'amber'} variant="subtle">
								{recipe.type === 'url' ? 'URL' : 'TEXT'}
							</Badge>
							<RecipeStatus recipe={recipe} onRetry={onRetry} />
						</Flex>
						{isTemporaryCreateRecipeId(recipe.id) ? null : (
							<Button
								colorScheme="red"
								loading={deleting}
								size="sm"
								variant="ghost"
								onClick={(event) => {
									event.stopPropagation();
									onDelete(recipe.id);
								}}
							>
								削除
							</Button>
						)}
					</Flex>

					{recipe.title ? <Heading size="md">{recipe.title}</Heading> : null}

					{recipe.type === 'url' ? (
						<Link
							href={recipe.label}
							lineClamp={2}
							overflowWrap="anywhere"
							rel="noreferrer"
							target="_blank"
							whiteSpace="pre-wrap"
							onClick={(event) => event.stopPropagation()}
						>
							{recipe.label}
						</Link>
					) : (
						<Text
							color={recipe.title ? 'fg.subtle' : 'inherit'}
							lineClamp={2}
							overflowWrap="anywhere"
							whiteSpace="pre-wrap"
						>
							{recipe.label}
						</Text>
					)}

					{recipe.summary ? <Text whiteSpace="pre-wrap">{recipe.summary}</Text> : null}
					<Text color="fg.subtle" fontSize="sm">
						クリックでレシピ詳細を見る
					</Text>

					{recipe.processingStatus === 'completed' && recipe.requiresServingsInput ? (
						<Card.Root bg="bg.subtle" variant="outline">
							<Card.Body gap="sm">
								<Text fontWeight="medium">このレシピの元人数を入力してください</Text>
								<Text color="fg.subtle" fontSize="sm">
									材料換算に使うので、レシピ本文の元人数を入れてください。
								</Text>
								<Flex
									align={{ base: 'stretch', md: 'end' }}
									direction={{ base: 'column', md: 'row' }}
									gap="sm"
								>
									<Input
										min={1}
										type="number"
										value={servingsValue}
										onChange={(event) => onServingsChange(recipe.id, event.target.value)}
										onClick={(event) => event.stopPropagation()}
									/>
									<Button
										loading={savingServings}
										onClick={(event) => {
											event.stopPropagation();
											onSaveServings(recipe.id);
										}}
									>
										保存
									</Button>
								</Flex>
							</Card.Body>
						</Card.Root>
					) : null}

					{recipe.processingError ? <Text color="danger">{recipe.processingError}</Text> : null}
				</Card.Body>
			</Card.Root>

			<RecipeSourceDetailModal open={open} recipe={recipe} onClose={onClose} />
		</>
	);
};
