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
	Status,
	Text,
	Textarea,
	useNotice,
	VStack,
} from '@workspaces/ui';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import type { PlanEditorData } from '@/lib/plans/queries';
import type { PlanDocument } from '@/lib/plans/types';

type PlannerStreamMessage =
	| { type: 'status'; message: string }
	| { type: 'reasoning'; delta: string }
	| { type: 'tool'; message: string };

const getErrorMessage = (error: unknown): string => {
	if (error instanceof Error && error.message) {
		return error.message;
	}

	return '工程の生成に失敗しました。';
};

const parseLines = (value: string): string[] =>
	Array.from(
		new Set(
			value
				.split('\n')
				.map((item) => item.trim())
				.filter(Boolean),
		),
	);

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

const readEventStream = async ({
	onError,
	onMessage,
	response,
}: {
	response: Response;
	onMessage: (event: string, payload: unknown) => void;
	onError: (message: string) => void;
}): Promise<void> => {
	if (!response.body) {
		throw new Error('ストリームを開始できませんでした。');
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	const flushBlock = (block: string): void => {
		const lines = block
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean);

		if (lines.length === 0) {
			return;
		}

		const eventLine = lines.find((line) => line.startsWith('event:'));
		const dataLines = lines.filter((line) => line.startsWith('data:'));
		const event = eventLine?.slice('event:'.length).trim() ?? 'message';
		const data = dataLines.map((line) => line.slice('data:'.length).trim()).join('\n');
		let payload: unknown;

		try {
			payload = JSON.parse(data);
		} catch {
			onError('ストリームの解析に失敗しました。');
			return;
		}

		onMessage(event, payload);
	};

	while (true) {
		const { done, value } = await reader.read();

		if (done) {
			break;
		}

		buffer += decoder.decode(value, { stream: true });

		const blocks = buffer.split('\n\n');
		buffer = blocks.pop() ?? '';

		for (const block of blocks) {
			flushBlock(block);
		}
	}

	buffer += decoder.decode();

	if (buffer.trim()) {
		flushBlock(buffer);
	}
};

export const PlanPageClient = ({ initialPlan }: { initialPlan: PlanEditorData }) => {
	const router = useRouter();
	const notice = useNotice();
	const [requestedServings, setRequestedServings] = useState(
		String(getDefaultServings(initialPlan)),
	);
	const [availableEquipment, setAvailableEquipment] = useState(
		Array.isArray(initialPlan.activeVersion?.plan.metadata?.availableEquipment)
			? initialPlan.activeVersion.plan.metadata.availableEquipment.join('\n')
			: '',
	);
	const [constraints, setConstraints] = useState(
		Array.isArray(initialPlan.activeVersion?.plan.metadata?.constraints)
			? initialPlan.activeVersion.plan.metadata.constraints.join('\n')
			: '',
	);
	const [generatedPlan, setGeneratedPlan] = useState<PlanDocument | null>(
		initialPlan.activeVersion?.plan ?? null,
	);
	const [isGenerating, setIsGenerating] = useState(false);
	const [isProgressModalOpen, setIsProgressModalOpen] = useState(false);
	const [reasoningText, setReasoningText] = useState('');
	const [progressLogs, setProgressLogs] = useState<string[]>([]);
	const [progressTitle, setProgressTitle] = useState('工程を生成しています');
	const reasoningEndRef = useRef<HTMLDivElement | null>(null);
	const statusEndRef = useRef<HTMLDivElement | null>(null);

	const recipeTitleById = useMemo(
		() =>
			new Map(
				initialPlan.recipes.map((recipe) => [
					recipe.id,
					recipe.title ?? recipe.normalizedRecipe?.title ?? recipe.label,
				]),
			),
		[initialPlan.recipes],
	);

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

		setIsGenerating(true);
		setIsProgressModalOpen(true);
		setReasoningText('');
		setProgressLogs(['生成を開始しました。']);
		setProgressTitle('工程を生成しています');

		try {
			const response = await fetch(`/api/plans/${initialPlan.id}/generate/stream`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					requestedServings: parsedServings,
					availableEquipment: parseLines(availableEquipment),
					constraints: parseLines(constraints),
				}),
			});

			if (!response.ok) {
				const payload = (await response.json().catch(() => null)) as { message?: string } | null;
				throw new Error(payload?.message ?? '工程の生成に失敗しました。');
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
						throw new Error(data.message ?? '工程の生成に失敗しました。');
					}

					if (event === 'result') {
						const data = payload as { plan: PlanDocument };
						receivedPlan = true;
						setGeneratedPlan(data.plan);
						setProgressLogs((currentLogs) => appendLog(currentLogs, '工程の生成が完了しました。'));
						setProgressTitle('工程の生成が完了しました');
						scrollIntoViewOnNextFrame(statusEndRef.current);
					}
				},
				response,
			});

			if (!receivedPlan) {
				throw new Error('工程の生成結果を受信できませんでした。');
			}

			router.refresh();
			notice({
				description: 'AI が工程を構成しました。',
				status: 'success',
				title: '生成完了',
			});
		} catch (error) {
			setProgressTitle('工程の生成に失敗しました');
			setProgressLogs((currentLogs) => appendLog(currentLogs, getErrorMessage(error)));
			notice({
				description: getErrorMessage(error),
				status: 'error',
				title: '生成失敗',
			});
		} finally {
			setIsGenerating(false);
		}
	};

	return (
		<>
			<Modal.Root
				autoFocus={false}
				closeOnEsc={false}
				closeOnOverlay={false}
				open={isProgressModalOpen}
				restoreFocus={false}
				withCloseButton={!isGenerating}
				onClose={() => {
					if (!isGenerating) {
						setIsProgressModalOpen(false);
					}
				}}
			>
				<Modal.Overlay backdropFilter="blur(6px)" bg="blackAlpha.400" />
				<Modal.Content
					maxH="42vh"
					mt="4vh"
					mx="auto"
					overflow="hidden"
					w="min(42rem, calc(100% - 2rem))"
				>
					<Modal.Header px="lg" pt="lg">
						<Flex align="center" gap="sm" justify="space-between" w="full">
							<VStack align="stretch" gap="xs">
								<Modal.Title>{progressTitle}</Modal.Title>
								<Text color="fg.subtle" fontSize="sm">
									{isGenerating
										? '推論の要約をリアルタイム表示しています。'
										: '生成ログを確認できます。'}
								</Text>
							</VStack>
							{isGenerating ? <Loading.Oval color="blue.500" fontSize="lg" /> : null}
						</Flex>
					</Modal.Header>
					<Modal.Body px="lg" py="md">
						<VStack align="stretch" gap="sm">
							<Card.Root bg="bg.subtle" variant="outline">
								<Card.Body gap="sm" maxH="20vh" overflowY="auto">
									<Text color="fg.subtle" fontSize="sm" fontWeight="semibold">
										Reasoning
									</Text>
									<Text fontFamily="mono" fontSize="sm" whiteSpace="pre-wrap">
										{reasoningText || '推論の要約がここに流れます。'}
									</Text>
									<div ref={reasoningEndRef} />
								</Card.Body>
							</Card.Root>
							<Card.Root bg="bg.muted" variant="outline">
								<Card.Body gap="xs" maxH="10vh" overflowY="auto">
									<Text color="fg.subtle" fontSize="sm" fontWeight="semibold">
										Status
									</Text>
									<For each={progressLogs}>
										{(log, index) => (
											<Text key={`${log}-${index}`} fontFamily="mono" fontSize="xs">
												{log}
											</Text>
										)}
									</For>
									<div ref={statusEndRef} />
								</Card.Body>
							</Card.Root>
						</VStack>
					</Modal.Body>
					{isGenerating ? null : (
						<Modal.Footer px="lg" pb="lg" pt="sm">
							<Button onClick={() => setIsProgressModalOpen(false)} variant="solid">
								閉じる
							</Button>
						</Modal.Footer>
					)}
				</Modal.Content>
			</Modal.Root>

			<VStack align="stretch" gap="lg">
				<Card.Root variant="outline">
					<Card.Body gap="md">
						<VStack align="stretch" gap="xs">
							<Heading size="lg">工程生成の条件</Heading>
							<Text color="fg.subtle">
								構造化済みレシピをもとに、人数・器具・制約を加味した工程を AI が構成します。
							</Text>
						</VStack>

						<Flex direction={{ base: 'column', md: 'row' }} gap="md">
							<VStack align="stretch" flex="1" gap="sm">
								<Text fontWeight="medium">人数</Text>
								<Input
									min={1}
									type="number"
									value={requestedServings}
									onChange={(event) => setRequestedServings(event.target.value)}
								/>
							</VStack>
							<VStack align="stretch" flex="1" gap="sm">
								<Text fontWeight="medium">利用可能な器具</Text>
								<Textarea
									autosize
									minH="8rem"
									placeholder={'フライパン\n鍋\nオーブン'}
									value={availableEquipment}
									onChange={(event) => setAvailableEquipment(event.target.value)}
								/>
							</VStack>
							<VStack align="stretch" flex="1" gap="sm">
								<Text fontWeight="medium">制約条件</Text>
								<Textarea
									autosize
									minH="8rem"
									placeholder={'20分以内\n辛さ控えめ\n洗い物を少なく'}
									value={constraints}
									onChange={(event) => setConstraints(event.target.value)}
								/>
							</VStack>
						</Flex>

						<Flex justify="end">
							<Button loading={isGenerating} onClick={() => void handleGenerate()}>
								{generatedPlan ? '工程を再生成' : '工程を生成'}
							</Button>
						</Flex>
					</Card.Body>
				</Card.Root>

				<VStack align="stretch" gap="md">
					<Heading size="md">入力レシピ</Heading>
					<For each={initialPlan.recipes}>
						{(recipe) => (
							<Card.Root key={recipe.id} variant="outline">
								<Card.Body gap="sm">
									<Flex align="center" justify="space-between" gap="sm" wrap="wrap">
										<Badge colorScheme={recipe.type === 'url' ? 'blue' : 'amber'} variant="subtle">
											{recipe.type === 'url' ? 'URL' : 'TEXT'}
										</Badge>
										<Status value={recipe.processingStatus === 'completed' ? 'success' : 'warning'}>
											{recipe.processingStatus === 'completed' ? '抽出完了' : '未完了'}
										</Status>
									</Flex>
									<Heading size="sm">{recipe.title ?? recipe.label}</Heading>
									{recipe.summary ? <Text>{recipe.summary}</Text> : null}
								</Card.Body>
							</Card.Root>
						)}
					</For>
				</VStack>

				{generatedPlan ? (
					<VStack align="stretch" gap="md">
						<Flex align="center" justify="space-between" wrap="wrap" gap="sm">
							<VStack align="stretch" gap="xs">
								<Heading size="md">生成された工程</Heading>
								<Text color="fg.subtle">
									{generatedPlan.servings}人分 / {generatedPlan.steps.length} ステップ
								</Text>
							</VStack>
							{initialPlan.activeVersion ? (
								<Badge colorScheme="green" variant="subtle">
									v{initialPlan.activeVersion.versionNumber}
								</Badge>
							) : null}
						</Flex>

						<For each={generatedPlan.steps}>
							{(step, index) => (
								<Card.Root key={step.id} variant="outline">
									<Card.Body gap="sm">
										<Flex align="start" justify="space-between" gap="sm" wrap="wrap">
											<VStack align="stretch" gap="xs">
												<Text color="fg.subtle" fontSize="sm">
													STEP {index + 1}
												</Text>
												<Heading size="sm">{step.title}</Heading>
											</VStack>
											<Badge colorScheme="blue" variant="subtle">
												約{step.estimatedMinutes}分
											</Badge>
										</Flex>

										<Text whiteSpace="pre-wrap">{step.description}</Text>

										{step.recipeSourceId ? (
											<Text color="fg.subtle" fontSize="sm">
												元レシピ: {recipeTitleById.get(step.recipeSourceId) ?? step.recipeSourceId}
											</Text>
										) : null}

										{step.dependencies.length > 0 ? (
											<Text color="fg.subtle" fontSize="sm">
												依存: {step.dependencies.join(', ')}
											</Text>
										) : null}

										<Text color="fg.subtle" fontSize="sm">
											並行実行: {step.canParallelize ? '可能' : '不可'}
										</Text>

										{step.timers?.length ? (
											<Text color="fg.subtle" fontSize="sm">
												タイマー: {step.timers.map((timer) => timer.label).join(', ')}
											</Text>
										) : null}

										{step.notesForUser?.length ? (
											<Text color="fg.subtle" fontSize="sm">
												注意: {step.notesForUser.join(' / ')}
											</Text>
										) : null}

										{step.recoveryTips?.length ? (
											<Text color="fg.subtle" fontSize="sm">
												リカバリー: {step.recoveryTips.join(' / ')}
											</Text>
										) : null}
									</Card.Body>
								</Card.Root>
							)}
						</For>
					</VStack>
				) : null}
			</VStack>
		</>
	);
};
