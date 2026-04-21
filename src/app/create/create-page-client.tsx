'use client';

import {
	Button,
	Card,
	Flex,
	For,
	Heading,
	Text,
	useDisclosure,
	useNotice,
	VStack,
} from '@workspaces/ui';
import NextLink from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CreatePlanData, CreateRecipeItem, RecipeInputMode } from '@/lib/create-session';
import {
	addRecipeToPlanAction,
	confirmAdjustedRecipesAction,
	deleteRecipeFromPlanAction,
	retryRecipeAdjustmentAction,
	updateRecipeBaseServingsAction,
	updateRecipeInputAction,
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
		(recipe) =>
			recipe.processingStatus === 'completed' &&
			recipe.adjustmentStatus === 'completed' &&
			Boolean(recipe.adjustmentConfirmedAt) &&
			!recipe.requiresServingsInput &&
			Boolean(recipe.adjustedRecipe),
	);

const getReadyForReview = (recipes: CreateRecipeItem[]): boolean =>
	recipes.length > 0 &&
	recipes.every(
		(recipe) =>
			recipe.processingStatus === 'completed' &&
			recipe.adjustmentStatus === 'completed' &&
			!recipe.requiresServingsInput &&
			Boolean(recipe.adjustedRecipe),
	);

const getInitialServingsInputMap = (plan: CreatePlanData): Record<string, string> =>
	Object.fromEntries(
		plan.recipes.map((recipe) => [recipe.id, recipe.baseServings?.toString() ?? '']),
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
			currentMap[recipe.id] ?? recipe.baseServings?.toString() ?? '',
		]),
	);

export const CreatePageClient = ({ initialPlan }: { initialPlan: CreatePlanData }) => {
	const { open: isAddRecipeOpen, onClose: closeAddRecipe, onOpen: openAddRecipe } = useDisclosure();
	const {
		open: isEditRecipeOpen,
		onClose: closeEditRecipe,
		onOpen: openEditRecipe,
	} = useDisclosure();
	const [mode, setMode] = useState<RecipeInputMode>('url');
	const [urlValue, setUrlValue] = useState('');
	const [textValue, setTextValue] = useState('');
	const [editingRecipe, setEditingRecipe] = useState<CreateRecipeItem | null>(null);
	const [editMode, setEditMode] = useState<RecipeInputMode>('url');
	const [editUrlValue, setEditUrlValue] = useState('');
	const [editTextValue, setEditTextValue] = useState('');
	const [plan, setPlan] = useState<CreatePlanData>(initialPlan);
	const [deletingRecipeIds, setDeletingRecipeIds] = useState<string[]>([]);
	const [servingsInputByRecipeId, setServingsInputByRecipeId] = useState<Record<string, string>>(
		() => getInitialServingsInputMap(initialPlan),
	);
	const [savingServingsRecipeIds, setSavingServingsRecipeIds] = useState<string[]>([]);
	const [retryingAdjustmentRecipeIds, setRetryingAdjustmentRecipeIds] = useState<string[]>([]);
	const [updatingRecipeIds, setUpdatingRecipeIds] = useState<string[]>([]);
	const [confirmingAdjustments, setConfirmingAdjustments] = useState(false);
	const processingRecipeIdsRef = useRef<Set<string>>(new Set());
	const scheduledRecipeIdsRef = useRef<Set<string>>(new Set());
	const adjustingRecipeIdsRef = useRef<Set<string>>(new Set());
	const notice = useNotice();
	const confirmedRecipeCount = plan.recipes.filter((recipe) => recipe.adjustmentConfirmedAt).length;
	const readyForReview = getReadyForReview(plan.recipes);

	useEffect(() => {
		setPlan(initialPlan);
		setServingsInputByRecipeId(getInitialServingsInputMap(initialPlan));
	}, [initialPlan]);

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

	const queueRecipeAdjustment = useCallback(
		async (recipeId: string): Promise<void> => {
			if (adjustingRecipeIdsRef.current.has(recipeId)) {
				return;
			}

			adjustingRecipeIdsRef.current.add(recipeId);

			try {
				await fetch(`/api/plans/${plan.id}/recipe-sources/${recipeId}/adjust`, {
					method: 'POST',
				});
			} finally {
				adjustingRecipeIdsRef.current.delete(recipeId);
			}
		},
		[plan.id],
	);

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
		for (const recipe of plan.recipes) {
			if (
				recipe.processingStatus !== 'completed' ||
				recipe.adjustmentStatus !== 'idle' ||
				recipe.requiresServingsInput ||
				isTemporaryCreateRecipeId(recipe.id)
			) {
				continue;
			}

			void queueRecipeAdjustment(recipe.id);
		}
	}, [plan.recipes, queueRecipeAdjustment]);

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
			sourceValue: value,
			title: null,
			summary: null,
			normalizedRecipe: null,
			adjustedRecipe: null,
			baseServings: null,
			adjustedForServings: null,
			materialChanges: [],
			stepChanges: [],
			adjustmentStatus: 'idle',
			adjustmentAttemptCount: 0,
			adjustmentError: null,
			adjustmentConfirmedAt: null,
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
		closeAddRecipe();

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
				[payload.recipe.id]: payload.recipe.baseServings?.toString() ?? '',
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
								adjustedForServings: null,
								adjustedRecipe: null,
								adjustmentAttemptCount: 0,
								adjustmentConfirmedAt: null,
								adjustmentError: null,
								adjustmentStatus: 'idle',
								materialChanges: [],
								normalizedRecipe: null,
								processingStatus: 'failed',
								processingError: getErrorMessage(error),
								requiresServingsInput: false,
								stepChanges: [],
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
							adjustedForServings: null,
							adjustedRecipe: null,
							adjustmentAttemptCount: 0,
							adjustmentConfirmedAt: null,
							adjustmentError: null,
							adjustmentStatus: 'idle',
							materialChanges: [],
							processingStatus: 'queued',
							processingError: null,
							stepChanges: [],
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
			const payload = await updateRecipeBaseServingsAction({
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
				[recipeId]: payload.recipe.baseServings?.toString() ?? '',
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

	const handleRetryAdjustment = async (recipeId: string): Promise<void> => {
		setRetryingAdjustmentRecipeIds((currentIds) => [...currentIds, recipeId]);

		setPlan((currentPlan) => ({
			...currentPlan,
			canProceed: false,
			recipes: currentPlan.recipes.map((recipe) =>
				recipe.id === recipeId
					? {
							...recipe,
							adjustedForServings: null,
							adjustedRecipe: null,
							adjustmentAttemptCount: 0,
							adjustmentConfirmedAt: null,
							adjustmentError: null,
							adjustmentStatus: 'idle',
							materialChanges: [],
							stepChanges: [],
						}
					: recipe,
			),
		}));

		try {
			await retryRecipeAdjustmentAction({
				planId: plan.id,
				recipeId,
			});
			await refreshPlan();
		} catch (error) {
			await refreshPlan();
			notice({
				description: getErrorMessage(error),
				status: 'error',
				title: '再試行を開始できませんでした',
			});
		} finally {
			setRetryingAdjustmentRecipeIds((currentIds) =>
				currentIds.filter((currentId) => currentId !== recipeId),
			);
		}
	};

	const handleOpenEditRecipe = (recipe: CreateRecipeItem): void => {
		setEditingRecipe(recipe);
		setEditMode(recipe.type);
		setEditUrlValue(recipe.type === 'url' ? recipe.sourceValue : '');
		setEditTextValue(recipe.type === 'text' ? recipe.sourceValue : '');
		openEditRecipe();
	};

	const handleUpdateRecipe = async (): Promise<void> => {
		if (!editingRecipe) {
			return;
		}

		const rawValue = editMode === 'url' ? editUrlValue : editTextValue;
		const value = rawValue.trim();

		if (!value) {
			return;
		}

		setUpdatingRecipeIds((currentIds) => [...currentIds, editingRecipe.id]);

		setPlan((currentPlan) => ({
			...currentPlan,
			canProceed: false,
			recipes: currentPlan.recipes.map((recipe) =>
				recipe.id === editingRecipe.id
					? {
							...recipe,
							adjustedForServings: null,
							adjustedRecipe: null,
							adjustmentAttemptCount: 0,
							adjustmentConfirmedAt: null,
							adjustmentError: null,
							adjustmentStatus: 'idle',
							label: value,
							materialChanges: [],
							processingError: null,
							processingStatus: 'queued',
							requiresServingsInput: false,
							sourceValue: value,
							stepChanges: [],
							summary: null,
							title: null,
							type: editMode,
						}
					: recipe,
			),
		}));

		try {
			await updateRecipeInputAction({
				planId: plan.id,
				recipeId: editingRecipe.id,
				type: editMode,
				value,
			});
			closeEditRecipe();
			setEditingRecipe(null);
			await refreshPlan();
		} catch (error) {
			await refreshPlan();
			notice({
				description: getErrorMessage(error),
				status: 'error',
				title: 'レシピを更新できませんでした',
			});
		} finally {
			setUpdatingRecipeIds((currentIds) =>
				currentIds.filter((currentId) => currentId !== editingRecipe.id),
			);
		}
	};

	const handleConfirmAdjustments = async (): Promise<void> => {
		setConfirmingAdjustments(true);

		try {
			await confirmAdjustedRecipesAction({
				planId: plan.id,
			});
			await refreshPlan();
			notice({
				description: 'この最適化済みレシピを工程生成の前提として使います。',
				status: 'success',
				title: '最適化結果を確定しました',
			});
		} catch (error) {
			notice({
				description: getErrorMessage(error),
				status: 'error',
				title: '最適化結果を確定できませんでした',
			});
		} finally {
			setConfirmingAdjustments(false);
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
					<Heading size="xl">レシピを登録して最適化</Heading>
					<Text color="fg.subtle">
						人数と設定を前提に、各レシピを工程生成しやすい形へ先に最適化します。
					</Text>
					<Flex align={{ base: 'start', md: 'center' }} gap="sm" wrap="wrap">
						<Text color="fg.subtle" fontSize="sm">
							人数: {plan.requestedServings}人分
						</Text>
						<Button as={NextLink} href="/create/servings" size="sm" variant="ghost">
							人数を変更
						</Button>
					</Flex>
				</VStack>

				{readyForReview && !plan.canProceed ? (
					<Card.Root borderColor="green.300" variant="outline">
						<Card.Body gap="sm">
							<Heading size="md">最適化結果を確認してください</Heading>
							<Text color="fg.subtle" fontSize="sm">
								各レシピの詳細から材料差分と手順の変更点を確認できます。問題なければ一括で確定して、次の工程生成に進みます。
							</Text>
							<Flex
								align={{ base: 'stretch', md: 'center' }}
								direction={{ base: 'column', md: 'row' }}
								gap="sm"
								justify="space-between"
							>
								<Text color="fg.subtle" fontSize="sm">
									確認済み {confirmedRecipeCount} / {plan.recipes.length} 件
								</Text>
								<Button
									loading={confirmingAdjustments}
									onClick={() => void handleConfirmAdjustments()}
								>
									この最適化結果で確定する
								</Button>
							</Flex>
						</Card.Body>
					</Card.Root>
				) : null}

				<VStack align="stretch" gap="md">
					<For each={plan.recipes}>
						{(recipe) => (
							<RecipeCard
								key={recipe.id}
								deleting={deletingRecipeIds.includes(recipe.id)}
								editing={updatingRecipeIds.includes(recipe.id)}
								recipe={recipe}
								retryingAdjustment={retryingAdjustmentRecipeIds.includes(recipe.id)}
								savingServings={savingServingsRecipeIds.includes(recipe.id)}
								servingsValue={servingsInputByRecipeId[recipe.id] ?? ''}
								onDelete={(recipeId) => {
									void handleDeleteRecipe(recipeId).catch(() => undefined);
								}}
								onEdit={handleOpenEditRecipe}
								onRetry={handleRetry}
								onRetryAdjustment={(recipeId) => {
									void handleRetryAdjustment(recipeId);
								}}
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
					<Button onClick={openAddRecipe} variant="outline">
						レシピを追加
					</Button>

					<VStack align={{ base: 'stretch', md: 'end' }} gap="xs">
						{plan.canProceed ? (
							<Button as={NextLink} href={`/plans/${plan.id}/edit`} variant="solid">
								工程作成へ進む
							</Button>
						) : (
							<Button disabled variant="solid">
								工程作成へ進む
							</Button>
						)}
						<Text color="fg.subtle" fontSize="sm">
							抽出とレシピ最適化の確認が完了すると、工程作成に進めます。
						</Text>
					</VStack>
				</Flex>

				<AddRecipeModal
					mode={mode}
					open={isAddRecipeOpen}
					textValue={textValue}
					title="レシピを追加"
					submitLabel="追加する"
					urlValue={urlValue}
					onClose={closeAddRecipe}
					onModeChange={setMode}
					onSubmit={() => void handleAddRecipe()}
					onTextChange={setTextValue}
					onUrlChange={setUrlValue}
				/>

				<AddRecipeModal
					mode={editMode}
					open={isEditRecipeOpen}
					textValue={editTextValue}
					title="レシピを変更"
					submitLabel="変更して再試行"
					urlValue={editUrlValue}
					onClose={() => {
						closeEditRecipe();
						setEditingRecipe(null);
					}}
					onModeChange={setEditMode}
					onSubmit={() => void handleUpdateRecipe()}
					onTextChange={setEditTextValue}
					onUrlChange={setEditUrlValue}
				/>
			</VStack>
		</Flex>
	);
};
