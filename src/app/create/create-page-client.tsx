'use client';

import { Button, Flex, For, Heading, Text, useDisclosure, useNotice, VStack } from '@workspaces/ui';
import NextLink from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CreatePlanData, CreateRecipeItem, RecipeInputMode } from '@/lib/create-session';
import {
	addRecipeToPlanAction,
	deleteRecipeFromPlanAction,
	updateRecipeServingsAction,
} from './actions';
import { AddRecipeModal } from './add-recipe-modal';
import { RecipeCard } from './recipe-card';
import { isPendingRecipe, isTemporaryCreateRecipeId } from './recipe-status';

const getErrorMessage = (error: unknown): string => {
	if (error instanceof Error && error.message) {
		return error.message;
	}

	return '処理に失敗しました。';
};

const getCanProceed = (recipes: CreateRecipeItem[]): boolean =>
	recipes.length > 0 &&
	recipes.every(
		(recipe) => recipe.processingStatus === 'completed' && !recipe.requiresServingsInput,
	);

const getInitialServingsInputMap = (plan: CreatePlanData): Record<string, string> =>
	Object.fromEntries(
		plan.recipes.map((recipe) => [recipe.id, recipe.normalizedServings?.toString() ?? '']),
	);

const mergeServingsInputMap = ({
	currentMap,
	recipes,
}: {
	currentMap: Record<string, string>;
	recipes: CreateRecipeItem[];
}): Record<string, string> =>
	Object.fromEntries(
		recipes.map((recipe) => [
			recipe.id,
			currentMap[recipe.id] ?? recipe.normalizedServings?.toString() ?? '',
		]),
	);

export const CreatePageClient = ({ initialPlan }: { initialPlan: CreatePlanData }) => {
	const { open, onClose, onOpen } = useDisclosure();
	const [mode, setMode] = useState<RecipeInputMode>('url');
	const [urlValue, setUrlValue] = useState('');
	const [textValue, setTextValue] = useState('');
	const [plan, setPlan] = useState<CreatePlanData>(initialPlan);
	const [deletingRecipeIds, setDeletingRecipeIds] = useState<string[]>([]);
	const [servingsInputByRecipeId, setServingsInputByRecipeId] = useState<Record<string, string>>(
		() => getInitialServingsInputMap(initialPlan),
	);
	const [savingServingsRecipeIds, setSavingServingsRecipeIds] = useState<string[]>([]);
	const processingRecipeIdsRef = useRef<Set<string>>(new Set());
	const scheduledRecipeIdsRef = useRef<Set<string>>(new Set());
	const notice = useNotice();

	const refreshPlan = useCallback(async (): Promise<void> => {
		const response = await fetch(`/api/plans/${plan.id}`, {
			cache: 'no-store',
		});

		if (!response.ok) {
			throw new Error('プランの再取得に失敗しました。');
		}

		const payload = (await response.json()) as { plan: CreatePlanData };
		setPlan(payload.plan);
		setServingsInputByRecipeId((currentMap) =>
			mergeServingsInputMap({
				currentMap,
				recipes: payload.plan.recipes,
			}),
		);
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

			if (isTemporaryCreateRecipeId(recipe.id) || scheduledRecipeIdsRef.current.has(recipe.id)) {
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

		if (!value) {
			return;
		}

		const optimisticRecipe: CreateRecipeItem = {
			id: `temp-${crypto.randomUUID()}`,
			type: mode,
			label: value,
			title: null,
			summary: null,
			normalizedServings: null,
			processingStatus: 'queued',
			processingError: null,
			requiresServingsInput: false,
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
			const payload = await addRecipeToPlanAction({
				planId: plan.id,
				type: mode,
				value,
			});
			scheduledRecipeIdsRef.current.add(payload.recipe.id);

			setPlan((currentPlan) => ({
				...currentPlan,
				recipes: currentPlan.recipes.map((recipe) =>
					recipe.id === optimisticRecipe.id ? payload.recipe : recipe,
				),
			}));
			setServingsInputByRecipeId((currentMap) => ({
				...currentMap,
				[payload.recipe.id]: payload.recipe.normalizedServings?.toString() ?? '',
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
								normalizedServings: null,
								processingStatus: 'failed',
								processingError: getErrorMessage(error),
								requiresServingsInput: false,
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

	const handleUpdateServings = async (recipeId: string): Promise<void> => {
		const rawValue = servingsInputByRecipeId[recipeId]?.trim() ?? '';
		const servings = Number.parseInt(rawValue, 10);

		if (Number.isNaN(servings) || servings < 1) {
			notice({
				description: '1 以上の人数を入力してください。',
				status: 'error',
				title: '入力エラー',
			});
			return;
		}

		setSavingServingsRecipeIds((currentIds) => [...currentIds, recipeId]);

		try {
			const payload = await updateRecipeServingsAction({
				planId: plan.id,
				recipeId,
				servings,
			});

			setPlan((currentPlan) => {
				const nextRecipes = currentPlan.recipes.map((recipe) =>
					recipe.id === recipeId ? payload.recipe : recipe,
				);

				return {
					...currentPlan,
					canProceed: getCanProceed(nextRecipes),
					recipes: nextRecipes,
				};
			});
			setServingsInputByRecipeId((currentMap) => ({
				...currentMap,
				[recipeId]: payload.recipe.normalizedServings?.toString() ?? '',
			}));
		} catch (error) {
			notice({
				description: getErrorMessage(error),
				status: 'error',
				title: '人数を保存できませんでした',
			});
		} finally {
			setSavingServingsRecipeIds((currentIds) =>
				currentIds.filter((currentId) => currentId !== recipeId),
			);
		}
	};

	const handleDeleteRecipe = async (recipeId: string): Promise<void> => {
		if (isTemporaryCreateRecipeId(recipeId)) {
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
			await deleteRecipeFromPlanAction({
				planId: plan.id,
				recipeId,
			});
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
							<RecipeCard
								key={recipe.id}
								deleting={deletingRecipeIds.includes(recipe.id)}
								recipe={recipe}
								savingServings={savingServingsRecipeIds.includes(recipe.id)}
								servingsValue={servingsInputByRecipeId[recipe.id] ?? ''}
								onDelete={(recipeId) => {
									void handleDeleteRecipe(recipeId).catch(() => undefined);
								}}
								onRetry={handleRetry}
								onSaveServings={(recipeId) => {
									void handleUpdateServings(recipeId);
								}}
								onServingsChange={(recipeId, value) =>
									setServingsInputByRecipeId((currentMap) => ({
										...currentMap,
										[recipeId]: value,
									}))
								}
							/>
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
							<Button as={NextLink} href={`/plans/${plan.id}/edit`} variant="solid">
								planに進む
							</Button>
						) : (
							<Button disabled variant="solid">
								planに進む
							</Button>
						)}
						<Text color="fg.subtle" fontSize="sm">
							抽出完了と、人数不明レシピの入力後に plan へ進めます。
						</Text>
					</VStack>
				</Flex>

				<AddRecipeModal
					mode={mode}
					open={open}
					textValue={textValue}
					urlValue={urlValue}
					onClose={onClose}
					onModeChange={setMode}
					onSubmit={() => void handleAddRecipe()}
					onTextChange={setTextValue}
					onUrlChange={setUrlValue}
				/>
			</VStack>
		</Flex>
	);
};
