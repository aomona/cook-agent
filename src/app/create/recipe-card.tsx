'use client';

import { Badge, Button, Card, Flex, Heading, Input, Text } from '@workspaces/ui';
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
}) => (
	<Card.Root variant="outline">
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
						onClick={() => onDelete(recipe.id)}
					>
						削除
					</Button>
				)}
			</Flex>

			{recipe.title ? <Heading size="md">{recipe.title}</Heading> : null}

			<Text
				color={recipe.title ? 'fg.subtle' : 'inherit'}
				lineClamp={2}
				overflowWrap="anywhere"
				whiteSpace="pre-wrap"
			>
				{recipe.label}
			</Text>

			{recipe.summary ? <Text whiteSpace="pre-wrap">{recipe.summary}</Text> : null}

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
							/>
							<Button loading={savingServings} onClick={() => onSaveServings(recipe.id)}>
								保存
							</Button>
						</Flex>
					</Card.Body>
				</Card.Root>
			) : null}

			{recipe.processingError ? <Text color="danger">{recipe.processingError}</Text> : null}
		</Card.Body>
	</Card.Root>
);
