'use client';

import {
	Badge,
	Button,
	Card,
	Flex,
	Heading,
	Input,
	Text,
	Textarea,
	useNotice,
	VStack,
} from '@workspaces/ui';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { PlanMaterialsSection } from '@/components/plan-materials-section';
import { PlanStepCards } from '@/components/plan-step-cards';
import { PlanTimelineLazy } from '@/components/plan-timeline-lazy';
import { usePlanningSettings } from '@/components/planning-settings-provider';
import { PlanningSettingsSummary } from '@/components/planning-settings-summary';
import { RecipeSourceDetailCard } from '@/components/recipe-source-detail-card';
import type { PlanEditorData } from '@/lib/plans/queries';
import type { PlanDocument } from '@/lib/plans/types';
import { PlannerProgressModal } from './planner-progress-modal';
import { type PlannerStreamMessage, readEventStream } from './planner-stream';

const getErrorMessage = (error: unknown): string => {
	if (error instanceof Error && error.message) {
		return error.message;
	}

	return '工程の更新に失敗しました。';
};
const getDefaultServings = (plan: PlanEditorData): number => {
	if (plan.requestedServings) {
		return plan.requestedServings;
	}

	for (const recipe of plan.recipes) {
		if (recipe.normalizedRecipe?.servings) {
			return recipe.normalizedRecipe.servings;
		}
	}

	return 2;
};

const appendLog = (currentLogs: string[], nextLog: string): string[] =>
	[...currentLogs, nextLog].slice(-80);

const scrollIntoViewOnNextFrame = (element: HTMLDivElement | null): void => {
	window.requestAnimationFrame(() => {
		element?.scrollIntoView({
			block: 'end',
		});
	});
};

export const PlanEditPageClient = ({ initialPlan }: { initialPlan: PlanEditorData }) => {
	const router = useRouter();
	const notice = useNotice();
	const { openDrawer, settings } = usePlanningSettings();
	const [requestedServings, setRequestedServings] = useState(
		String(getDefaultServings(initialPlan)),
	);
	const [generatedPlan, setGeneratedPlan] = useState<PlanDocument | null>(
		initialPlan.activeVersion?.plan ?? null,
	);
	const [currentVersionNumber, setCurrentVersionNumber] = useState<number | null>(
		initialPlan.activeVersion?.versionNumber ?? null,
	);
	const [improvementRequest, setImprovementRequest] = useState('');
	const [isGenerating, setIsGenerating] = useState(false);
	const [isProgressModalOpen, setIsProgressModalOpen] = useState(false);
	const [reasoningText, setReasoningText] = useState('');
	const [progressLogs, setProgressLogs] = useState<string[]>([]);
	const [progressTitle, setProgressTitle] = useState('工程を生成しています');
	const reasoningEndRef = useRef<HTMLDivElement | null>(null);
	const statusEndRef = useRef<HTMLDivElement | null>(null);

	const recipeTitleById = Object.fromEntries(
		initialPlan.recipes.map((recipe) => [
			recipe.id,
			recipe.title ?? recipe.normalizedRecipe?.title ?? recipe.label,
		]),
	);
	const hasUnconfirmedRecipes = initialPlan.recipes.some((recipe) => !recipe.adjustmentConfirmedAt);

	const runPlannerStream = async ({
		body,
		completeLog,
		completeTitle,
		errorTitle,
		progressTitle: nextProgressTitle,
		startLog,
		successDescription,
		successTitle,
		url,
	}: {
		url: string;
		body: Record<string, unknown>;
		startLog: string;
		progressTitle: string;
		completeTitle: string;
		completeLog: string;
		successTitle: string;
		successDescription: string;
		errorTitle: string;
	}): Promise<void> => {
		setIsGenerating(true);
		setIsProgressModalOpen(true);
		setReasoningText('');
		setProgressLogs([startLog]);
		setProgressTitle(nextProgressTitle);

		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(body),
			});

			if (!response.ok) {
				const payload = (await response.json().catch(() => null)) as { message?: string } | null;
				throw new Error(payload?.message ?? '工程の更新に失敗しました。');
			}

			let receivedPlan = false;

			await readEventStream({
				onError: (message) => {
					throw new Error(message);
				},
				onMessage: (event, payload) => {
					if (event === 'reasoning') {
						const data = payload as Extract<PlannerStreamMessage, { type: 'reasoning' }>;
						setReasoningText((currentText) => currentText + data.delta);
						scrollIntoViewOnNextFrame(reasoningEndRef.current);
						return;
					}

					if (event === 'status' || event === 'tool') {
						const data = payload as Extract<PlannerStreamMessage, { type: 'status' | 'tool' }>;
						setProgressLogs((currentLogs) => appendLog(currentLogs, data.message));
						scrollIntoViewOnNextFrame(statusEndRef.current);
						return;
					}

					if (event === 'error') {
						const data = payload as { message?: string };
						throw new Error(data.message ?? '工程の更新に失敗しました。');
					}

					if (event === 'result') {
						const data = payload as {
							plan: PlanDocument;
							version?: { versionNumber?: number };
						};
						receivedPlan = true;
						setGeneratedPlan(data.plan);
						setCurrentVersionNumber(data.version?.versionNumber ?? null);
						setProgressLogs((currentLogs) => appendLog(currentLogs, completeLog));
						setProgressTitle(completeTitle);
						scrollIntoViewOnNextFrame(statusEndRef.current);
					}
				},
				response,
			});

			if (!receivedPlan) {
				throw new Error('工程の更新結果を受信できませんでした。');
			}

			router.refresh();
			notice({
				description: successDescription,
				status: 'success',
				title: successTitle,
			});
		} catch (error) {
			setProgressTitle(errorTitle);
			setProgressLogs((currentLogs) => appendLog(currentLogs, getErrorMessage(error)));
			notice({
				description: getErrorMessage(error),
				status: 'error',
				title: errorTitle,
			});
		} finally {
			setIsGenerating(false);
		}
	};

	const handleGenerate = async (): Promise<void> => {
		const parsedServings = Number.parseInt(requestedServings, 10);

		if (Number.isNaN(parsedServings) || parsedServings < 1) {
			notice({
				description: '1 以上の人数を入力してください。',
				status: 'error',
				title: '入力エラー',
			});
			return;
		}

		if (hasUnconfirmedRecipes) {
			notice({
				description: 'create フローでレシピ最適化を確認してから工程を生成してください。',
				status: 'error',
				title: 'まだ生成できません',
			});
			return;
		}

		await runPlannerStream({
			body: {
				requestedServings: parsedServings,
			},
			completeLog: '工程の生成が完了しました。',
			completeTitle: '工程の生成が完了しました',
			errorTitle: '生成失敗',
			progressTitle: '工程を生成しています',
			startLog: '生成を開始しました。',
			successDescription: 'AI が工程を構成しました。',
			successTitle: '生成完了',
			url: `/api/plans/${initialPlan.id}/generate/stream`,
		});
	};

	const handleImprove = async (): Promise<void> => {
		const parsedServings = Number.parseInt(requestedServings, 10);

		if (!generatedPlan) {
			notice({
				description: '先に工程を生成してください。',
				status: 'error',
				title: '改善できません',
			});
			return;
		}

		if (hasUnconfirmedRecipes) {
			notice({
				description: 'create フローでレシピ最適化を確認してから工程を改善してください。',
				status: 'error',
				title: 'まだ改善できません',
			});
			return;
		}

		if (Number.isNaN(parsedServings) || parsedServings < 1) {
			notice({
				description: '1 以上の人数を入力してください。',
				status: 'error',
				title: '入力エラー',
			});
			return;
		}

		if (!improvementRequest.trim()) {
			notice({
				description: '改善したい点を入力してください。',
				status: 'error',
				title: '入力エラー',
			});
			return;
		}

		await runPlannerStream({
			body: {
				requestedServings: parsedServings,
				currentPlan: generatedPlan,
				improvementRequest: improvementRequest.trim(),
			},
			completeLog: '工程の改善が完了しました。',
			completeTitle: '工程の改善が完了しました',
			errorTitle: '改善失敗',
			progressTitle: '工程を改善しています',
			startLog: '改善を開始しました。',
			successDescription: 'AI が工程を改善しました。',
			successTitle: '改善完了',
			url: `/api/plans/${initialPlan.id}/improve/stream`,
		});
	};

	return (
		<>
			<PlannerProgressModal
				isGenerating={isGenerating}
				onClose={() => setIsProgressModalOpen(false)}
				open={isProgressModalOpen}
				progressLogs={progressLogs}
				progressTitle={progressTitle}
				reasoningEndRef={reasoningEndRef}
				reasoningText={reasoningText}
				statusEndRef={statusEndRef}
			/>

			<VStack align="stretch" gap="lg">
				<Card.Root variant="outline">
					<Card.Body gap="md">
						<VStack align="stretch" gap="xs">
							<Heading size="lg">工程生成の条件</Heading>
							<Text color="fg.subtle">
								構造化済みレシピをもとに、人数と保存済みの工程設定を加味した工程を AI が構成します。
							</Text>
						</VStack>

						<Flex direction={{ base: 'column', xl: 'row' }} gap="md">
							<VStack align="stretch" flex={{ base: '1', xl: '0 0 180px' }} gap="sm">
								<Text fontWeight="medium">人数</Text>
								<Input
									min={1}
									type="number"
									value={requestedServings}
									onChange={(event) => setRequestedServings(event.target.value)}
								/>
							</VStack>
							<PlanningSettingsSummary
								action={
									<Button variant="outline" onClick={openDrawer}>
										設定を開く
									</Button>
								}
								description="器具・制約は drawer から編集します。保存した内容が generate と improve の両方に反映されます。"
								settings={settings}
								title="適用中の工程設定"
							/>
						</Flex>

						{hasUnconfirmedRecipes ? (
							<Text color="orange.500" fontSize="sm">
								この plan の前提レシピはまだ最適化結果の確認が終わっていません。`/create`
								に戻って確認すると工程生成できます。
							</Text>
						) : null}

						<Flex justify="end">
							<Button
								disabled={hasUnconfirmedRecipes}
								loading={isGenerating}
								onClick={() => void handleGenerate()}
							>
								{generatedPlan ? '工程を再生成' : '工程を生成'}
							</Button>
						</Flex>
					</Card.Body>
				</Card.Root>

				<VStack align="stretch" gap="md">
					<Heading size="md">入力レシピ</Heading>
					{initialPlan.recipes.map((recipe) => (
						<RecipeSourceDetailCard key={recipe.id} recipe={recipe} />
					))}
				</VStack>

				{generatedPlan ? (
					<PlanMaterialsSection plan={generatedPlan} recipeTitleById={recipeTitleById} />
				) : null}

				{generatedPlan ? (
					<VStack align="stretch" gap="md">
						<Flex align="center" justify="space-between" wrap="wrap" gap="sm">
							<VStack align="stretch" gap="xs">
								<Heading size="md">生成された工程</Heading>
								<Text color="fg.subtle">
									{generatedPlan.servings}人分 / {generatedPlan.steps.length} ステップ
								</Text>
							</VStack>
							{currentVersionNumber ? (
								<Badge colorScheme="green" variant="subtle">
									v{currentVersionNumber}
								</Badge>
							) : null}
						</Flex>

						<PlanTimelineLazy editable plan={generatedPlan} recipeTitleById={recipeTitleById} />

						<PlanStepCards
							plan={generatedPlan}
							recipeTitleById={recipeTitleById}
							showRecipeSource
							showTimers
							useDurationBadge
						/>
					</VStack>
				) : initialPlan.hasIncompatibleActiveVersion ? (
					<Card.Root borderColor="amber.300" bg="amber.50" variant="outline">
						<Card.Body gap="sm">
							<Heading size="md">古い形式の工程です</Heading>
							<Text color="fg.subtle">
								この plan は新しい timeline-first schema
								に未対応です。再生成すると新形式に置き換わります。
							</Text>
						</Card.Body>
					</Card.Root>
				) : null}

				{generatedPlan ? (
					<Card.Root variant="outline">
						<Card.Body gap="md">
							<VStack align="stretch" gap="xs">
								<Heading size="md">工程を改善する</Heading>
								<Text color="fg.subtle">
									今の工程を見た上で、改善したい点を自然文で入力できます。
								</Text>
							</VStack>

							<Textarea
								autosize
								minH="10rem"
								placeholder={
									'例:\n・洗い物を減らしたい\n・盛り付け直前の作業を減らしたい\n・フライパンを1つしか使わない構成にしたい'
								}
								value={improvementRequest}
								onChange={(event) => setImprovementRequest(event.target.value)}
							/>

							<Flex justify="end">
								<Button
									disabled={hasUnconfirmedRecipes}
									loading={isGenerating}
									onClick={() => void handleImprove()}
								>
									この工程を改善する
								</Button>
							</Flex>
						</Card.Body>
					</Card.Root>
				) : null}
			</VStack>
		</>
	);
};
