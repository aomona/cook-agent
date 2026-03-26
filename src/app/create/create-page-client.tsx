'use client';

import {
	Badge,
	Button,
	Card,
	Flex,
	For,
	Heading,
	Input,
	Loading,
	Modal,
	SegmentedControl,
	Status,
	Text,
	Textarea,
	useDisclosure,
	useNotice,
	VStack,
} from '@workspaces/ui';
import NextLink from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CreatePlanData, CreateRecipeItem, RecipeInputMode } from '@/lib/create-session';

const pendingStatuses = new Set(['queued', 'processing']);

const isTemporaryRecipeId = (recipeId: string): boolean => recipeId.startsWith('temp-');

const getErrorMessage = (error: unknown): string => {
	if (error instanceof Error && error.message) {
		return error.message;
	}

	return '処理に失敗しました。';
};

const isPendingRecipe = (recipe: CreateRecipeItem): boolean =>
	pendingStatuses.has(recipe.processingStatus);

const getCanProceed = (recipes: CreateRecipeItem[]): boolean =>
	recipes.length > 0 && recipes.every((recipe) => recipe.processingStatus === 'completed');

const RecipeStatus = ({
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
			<Loading.Oval color="blue.500" fontSize="lg" />
			<Text fontSize="sm">レシピを抽出中...</Text>
		</Flex>
	);
};

export const CreatePageClient = ({ initialPlan }: { initialPlan: CreatePlanData }) => {
	const { open, onClose, onOpen } = useDisclosure();
	const [mode, setMode] = useState<RecipeInputMode>('url');
	const [urlValue, setUrlValue] = useState('');
	const [textValue, setTextValue] = useState('');
	const [plan, setPlan] = useState<CreatePlanData>(initialPlan);
	const [deletingRecipeIds, setDeletingRecipeIds] = useState<string[]>([]);
	const processingRecipeIdsRef = useRef<Set<string>>(new Set());
	const scheduledRecipeIdsRef = useRef<Set<string>>(new Set());
	const notice = useNotice();

	const modeItems = useMemo(
		() => [
			{ label: 'URL', value: 'url' },
			{ label: 'Text', value: 'text' },
		],
		[],
	);

	const refreshPlan = useCallback(async (): Promise<void> => {
		const response = await fetch(`/api/plans/${plan.id}`, {
			cache: 'no-store',
		});

		if (!response.ok) {
			throw new Error('プランの再取得に失敗しました。');
		}

		const payload = (await response.json()) as { plan: CreatePlanData };
		setPlan(payload.plan);
	}, [plan.id]);

	const queueRecipeProcessing = useCallback(async (recipeId: string): Promise<void> => {
		if (processingRecipeIdsRef.current.has(recipeId)) {
			return;
		}

		processingRecipeIdsRef.current.add(recipeId);

		try {
			await fetch(`/api/recipe-sources/${recipeId}/process`, {
				method: 'POST',
			});
		} finally {
			processingRecipeIdsRef.current.delete(recipeId);
		}
	}, []);

	useEffect(() => {
		for (const recipe of plan.recipes) {
			if (recipe.processingStatus !== 'queued') {
				scheduledRecipeIdsRef.current.delete(recipe.id);
				continue;
			}

			if (isTemporaryRecipeId(recipe.id) || scheduledRecipeIdsRef.current.has(recipe.id)) {
				continue;
			}

			void queueRecipeProcessing(recipe.id);
		}
	}, [plan.recipes, queueRecipeProcessing]);

	useEffect(() => {
		if (!plan.recipes.some(isPendingRecipe)) {
			return;
		}

		const intervalId = window.setInterval(() => {
			void refreshPlan().catch(() => undefined);
		}, 2500);

		return () => {
			window.clearInterval(intervalId);
		};
	}, [plan.recipes, refreshPlan]);

	const handleAddRecipe = async (): Promise<void> => {
		const rawValue = mode === 'url' ? urlValue : textValue;
		const value = rawValue.trim();

		if (!value) return;

		const optimisticRecipe: CreateRecipeItem = {
			id: `temp-${crypto.randomUUID()}`,
			type: mode,
			label: value,
			title: null,
			summary: null,
			processingStatus: 'queued',
			processingError: null,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		setPlan((currentPlan) => ({
			...currentPlan,
			recipes: [...currentPlan.recipes, optimisticRecipe],
			canProceed: false,
		}));

		setUrlValue('');
		setTextValue('');
		onClose();

		try {
			const response = await fetch(`/api/plans/${plan.id}/recipes`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					type: mode,
					value,
				}),
			});

			if (!response.ok) {
				const payload = (await response.json().catch(() => null)) as { message?: string } | null;
				throw new Error(payload?.message ?? 'レシピの追加に失敗しました。');
			}

			const payload = (await response.json()) as { recipe: CreateRecipeItem };
			scheduledRecipeIdsRef.current.add(payload.recipe.id);

			setPlan((currentPlan) => ({
				...currentPlan,
				recipes: currentPlan.recipes.map((recipe) =>
					recipe.id === optimisticRecipe.id ? payload.recipe : recipe,
				),
			}));

			window.setTimeout(() => {
				scheduledRecipeIdsRef.current.delete(payload.recipe.id);
			}, 5000);
		} catch (error) {
			setPlan((currentPlan) => ({
				...currentPlan,
				recipes: currentPlan.recipes.map((recipe) =>
					recipe.id === optimisticRecipe.id
						? {
								...recipe,
								processingStatus: 'failed',
								processingError: getErrorMessage(error),
							}
						: recipe,
				),
			}));
		}
	};

	const handleRetry = (recipeId: string): void => {
		setPlan((currentPlan) => ({
			...currentPlan,
			recipes: currentPlan.recipes.map((recipe) =>
				recipe.id === recipeId
					? {
							...recipe,
							processingStatus: 'queued',
							processingError: null,
						}
					: recipe,
			),
			canProceed: false,
		}));

		void queueRecipeProcessing(recipeId);
	};

	const handleDeleteRecipe = async (recipeId: string): Promise<void> => {
		if (isTemporaryRecipeId(recipeId)) {
			return;
		}

		setDeletingRecipeIds((currentIds) => [...currentIds, recipeId]);

		setPlan((currentPlan) => {
			const nextRecipes = currentPlan.recipes.filter((recipe) => recipe.id !== recipeId);

			return {
				...currentPlan,
				recipes: nextRecipes,
				canProceed: getCanProceed(nextRecipes),
			};
		});

		try {
			const response = await fetch(`/api/plans/${plan.id}/recipes/${recipeId}`, {
				method: 'DELETE',
			});

			if (!response.ok) {
				const payload = (await response.json().catch(() => null)) as { message?: string } | null;
				throw new Error(payload?.message ?? 'レシピの削除に失敗しました。');
			}
		} catch (error) {
			await refreshPlan();
			notice({
				description: getErrorMessage(error),
				status: 'error',
				title: 'レシピを削除できませんでした',
			});
			throw error;
		} finally {
			setDeletingRecipeIds((currentIds) =>
				currentIds.filter((currentId) => currentId !== recipeId),
			);
		}
	};

	return (
		<Flex align="center" h="full" justify="center" px="md" py="xl">
			<VStack align="stretch" gap="lg" maxW="3xl" w="full">
				<Flex justify="start">
					<Button as={NextLink} href="/" variant="ghost">
						戻る
					</Button>
				</Flex>

				<VStack align="stretch" gap="xs">
					<Heading size="xl">レシピを登録</Heading>
					<Text color="fg.subtle">献立に使うレシピ一覧</Text>
				</VStack>

				<VStack align="stretch" gap="md">
					<For each={plan.recipes}>
						{(recipe) => (
							<Card.Root key={recipe.id} variant="outline">
								<Card.Body gap="sm">
									<Flex align="center" w="full" gap="sm" justify="space-between">
										<Flex align="center" gap="sm" wrap="wrap">
											<Badge
												colorScheme={recipe.type === 'url' ? 'blue' : 'amber'}
												variant="subtle"
											>
												{recipe.type === 'url' ? 'URL' : 'TEXT'}
											</Badge>
											<RecipeStatus recipe={recipe} onRetry={handleRetry} />
										</Flex>
										{isTemporaryRecipeId(recipe.id) ? null : (
											<Button
												colorScheme="red"
												loading={deletingRecipeIds.includes(recipe.id)}
												size="sm"
												variant="ghost"
												onClick={() => void handleDeleteRecipe(recipe.id).catch(() => undefined)}
											>
												削除
											</Button>
										)}
									</Flex>

									{recipe.title ? <Heading size="md">{recipe.title}</Heading> : null}

									<Text
										color={recipe.title ? 'fg.subtle' : 'inherit'}
										lineClamp={2}
										whiteSpace="pre-wrap"
									>
										{recipe.label}
									</Text>

									{recipe.summary ? <Text whiteSpace="pre-wrap">{recipe.summary}</Text> : null}

									{recipe.processingError ? (
										<Text color="danger">{recipe.processingError}</Text>
									) : null}
								</Card.Body>
							</Card.Root>
						)}
					</For>
				</VStack>

				<Flex
					align={{ base: 'stretch', md: 'center' }}
					direction={{ base: 'column', md: 'row' }}
					gap="md"
					justify="space-between"
				>
					<Button onClick={onOpen} variant="outline">
						レシピを追加
					</Button>

					<VStack align={{ base: 'stretch', md: 'end' }} gap="xs">
						{plan.canProceed ? (
							<Button as={NextLink} href="/plan" variant="solid">
								planに進む
							</Button>
						) : (
							<Button disabled variant="solid">
								planに進む
							</Button>
						)}
						<Text color="fg.subtle" fontSize="sm">
							抽出完了後に plan へ進めます。
						</Text>
					</VStack>
				</Flex>

				<Modal.Root open={open} size="lg" onClose={onClose}>
					<Modal.Overlay backdropFilter="blur(4px)" />
					<Modal.Content mx="md" w="calc(100% - 2rem)">
						<Modal.Header px="lg" pt="lg">
							<Modal.Title>レシピを追加</Modal.Title>
						</Modal.Header>

						<Modal.Body px="lg" py="md">
							<VStack align="stretch" gap="md">
								<SegmentedControl.Root
									items={modeItems}
									value={mode}
									onChange={(value) => setMode(value as RecipeInputMode)}
								/>

								{mode === 'url' ? (
									<VStack align="stretch" gap="sm">
										<Text fontWeight="medium">URL</Text>
										<Input
											aria-label="レシピURL"
											placeholder="https://example.com/recipe"
											value={urlValue}
											onChange={(event) => setUrlValue(event.target.value)}
										/>
									</VStack>
								) : (
									<VStack align="stretch" gap="sm">
										<Text fontWeight="medium">Text</Text>
										<Textarea
											aria-label="レシピテキスト"
											autosize
											minH="9rem"
											placeholder="材料や手順のメモを貼り付けてください"
											value={textValue}
											onChange={(event) => setTextValue(event.target.value)}
										/>
									</VStack>
								)}
							</VStack>
						</Modal.Body>

						<Modal.Footer px="lg" pb="lg" pt="sm">
							<Button variant="ghost" onClick={onClose}>
								閉じる
							</Button>
							<Button onClick={() => void handleAddRecipe()}>追加する</Button>
						</Modal.Footer>
					</Modal.Content>
				</Modal.Root>
			</VStack>
		</Flex>
	);
};
