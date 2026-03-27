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
import type { PlanRecipeSnapshot } from '@/lib/plans/queries';

const getRecipeTitle = (recipe: PlanRecipeSnapshot): string =>
	recipe.title ?? recipe.normalizedRecipe?.title ?? recipe.label;

export const RecipeSourceDetailCard = ({ recipe }: { recipe: PlanRecipeSnapshot }) => {
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

			<Modal.Root open={open} scrollBehavior="inside" size="xl" onClose={onClose}>
				<Modal.Overlay backdropFilter="blur(4px)" />
				<Modal.Content maxH="min(80vh, 48rem)" mx="md" w="calc(100% - 2rem)">
					<Modal.Header px="lg" pt="lg">
						<VStack align="stretch" gap="xs">
							<Flex align="center" gap="sm" wrap="wrap">
								<Badge colorScheme={recipe.type === 'url' ? 'blue' : 'amber'} variant="subtle">
									{recipe.type === 'url' ? 'URL' : 'TEXT'}
								</Badge>
								<Badge colorScheme="blackAlpha" variant="subtle">
									{getRecipeProcessingLabel(recipe.processingStatus)}
								</Badge>
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
										<Link href={recipe.label} rel="noreferrer" target="_blank">
											{recipe.label}
										</Link>
									) : (
										<Text whiteSpace="pre-wrap">{recipe.label}</Text>
									)}
								</Card.Body>
							</Card.Root>

							{recipe.normalizedRecipe ? (
								<>
									<Card.Root variant="outline">
										<Card.Body gap="xs">
											<Heading size="sm">基本情報</Heading>
											<Text color="fg.subtle">
												人数:{' '}
												{recipe.normalizedRecipe.servings
													? `${recipe.normalizedRecipe.servings}人分`
													: '未設定'}
											</Text>
										</Card.Body>
									</Card.Root>

									{recipe.normalizedRecipe.ingredients.length > 0 ? (
										<Card.Root variant="outline">
											<Card.Body gap="xs">
												<Heading size="sm">材料</Heading>
												{recipe.normalizedRecipe.ingredients.map((ingredient) => (
													<Text key={ingredient.id} whiteSpace="pre-wrap">
														・{formatIngredientLine(ingredient)}
													</Text>
												))}
											</Card.Body>
										</Card.Root>
									) : null}

									{recipe.normalizedRecipe.steps.length > 0 ? (
										<Card.Root variant="outline">
											<Card.Body gap="sm">
												<Heading size="sm">手順</Heading>
												{recipe.normalizedRecipe.steps.map((step) => (
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
		</>
	);
};
