'use client';

import {
	Badge,
	Button,
	Card,
	Flex,
	Heading,
	Separator,
	Text,
	useNotice,
	VStack,
} from '@workspaces/ui';
import { useRouter } from 'next/navigation';
import { startTransition, useEffect, useState } from 'react';
import type { CookSessionSnapshot } from '@/lib/cook-runtime/types';
import { formatStructuredAmount } from '@/lib/plans/presentation';
import { useCookLiveSession } from './use-cook-live-session';

const getSessionStatusLabel = (
	status: NonNullable<CookSessionSnapshot['session']>['status'],
): string => {
	switch (status) {
		case 'active':
			return '進行中';
		case 'paused':
			return '一時停止';
		case 'completed':
			return '完了';
		case 'abandoned':
			return '中断';
		default:
			return '未開始';
	}
};

const getStepMaterialLabels = (snapshot: CookSessionSnapshot): string[] => {
	if (!snapshot.currentStep?.uses?.length) {
		return [];
	}

	const materialById = Object.fromEntries(
		snapshot.plan.document.materials.map((material) => [
			material.id,
			formatStructuredAmount(material)
				? `${material.name} (${formatStructuredAmount(material)})`
				: material.name,
		]),
	);

	return snapshot.currentStep.uses.map((materialId) => materialById[materialId] ?? materialId);
};

export const CookRuntimePageClient = ({
	initialSnapshot,
}: {
	initialSnapshot: CookSessionSnapshot;
}) => {
	const router = useRouter();
	const notice = useNotice();
	const [snapshot, setSnapshot] = useState(initialSnapshot);
	const [isPending, setIsPending] = useState(false);
	const [isTranscriptExpanded, setIsTranscriptExpanded] = useState(false);
	const currentMaterials = getStepMaterialLabels(snapshot);
	const primaryTimer = snapshot.timers[0] ?? null;
	const secondaryTimers = snapshot.timers.slice(1, 4);
	const {
		connect,
		connectionState,
		disconnect,
		latestError,
		microphoneState,
		refreshSnapshot,
		toggleMicrophone,
		transcriptEntries,
	} = useCookLiveSession({
		planId: snapshot.plan.id,
		onSnapshot: setSnapshot,
	});

	useEffect(() => {
		const interval = window.setInterval(() => {
			setSnapshot((currentSnapshot) => ({ ...currentSnapshot }));
		}, 1000);

		return () => {
			window.clearInterval(interval);
		};
	}, []);

	const getTimerDisplaySeconds = (timer: CookSessionSnapshot['timers'][number]): number => {
		if (timer.status === 'paused') {
			return timer.pausedRemainingSeconds ?? timer.durationSeconds;
		}

		if (timer.status === 'running' && timer.endsAt) {
			return Math.max(0, Math.ceil((new Date(timer.endsAt).getTime() - Date.now()) / 1000));
		}

		return timer.remainingSeconds ?? timer.durationSeconds;
	};

	const applyAction = async (body: Record<string, unknown>) => {
		if (!snapshot.session) {
			return;
		}

		setIsPending(true);

		try {
			const response = await fetch(`/api/cooking-sessions/${snapshot.session.id}/actions`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(body),
			});
			const payload = (await response.json()) as {
				message?: string;
				snapshot?: CookSessionSnapshot;
			};

			if (!response.ok || !payload.snapshot) {
				throw new Error(payload.message ?? '調理セッションの更新に失敗しました。');
			}

			setSnapshot(payload.snapshot);
			void refreshSnapshot();
			startTransition(() => {
				router.refresh();
			});
		} catch (error) {
			notice({
				description:
					error instanceof Error ? error.message : '調理セッションの更新に失敗しました。',
				status: 'error',
				title: '更新失敗',
			});
		} finally {
			setIsPending(false);
		}
	};

	const startSession = async () => {
		setIsPending(true);

		try {
			const response = await fetch(`/api/plans/${snapshot.plan.id}/cook/session`, {
				method: 'POST',
			});
			const payload = (await response.json()) as {
				message?: string;
				snapshot?: CookSessionSnapshot;
			};

			if (!response.ok || !payload.snapshot) {
				throw new Error(payload.message ?? '調理セッションの開始に失敗しました。');
			}

			setSnapshot(payload.snapshot);
			void refreshSnapshot();
			startTransition(() => {
				router.refresh();
			});
		} catch (error) {
			notice({
				description:
					error instanceof Error ? error.message : '調理セッションの開始に失敗しました。',
				status: 'error',
				title: '開始失敗',
			});
		} finally {
			setIsPending(false);
		}
	};

	const transcriptPreview = transcriptEntries.length
		? isTranscriptExpanded
			? transcriptEntries
			: transcriptEntries.slice(-6)
		: snapshot.recentEvents.slice(0, 6).map((event) => ({
				createdAt: new Date(event.occurredAt).getTime(),
				id: event.id,
				role: 'status' as const,
				text: event.message,
			}));

	return (
		<VStack align="stretch" gap="lg">
			<Flex align="center" justify="space-between" gap="md" wrap="wrap">
				<VStack align="stretch" gap="xs">
					<Heading size="lg">Realtime Cook Runtime</Heading>
					<Text color="fg.subtle">
						音声主導の Gemini Live runtime
						です。現在ステップ、次ステップ、タイマー、会話ログを見ながら調理を進められます。
					</Text>
					{latestError ? <Text color="danger">{latestError}</Text> : null}
				</VStack>
				<Flex gap="sm" wrap="wrap">
					<Badge colorScheme="blue" variant="subtle">
						v{snapshot.plan.versionNumber}
					</Badge>
					<Badge
						colorScheme={
							connectionState === 'connected'
								? 'green'
								: connectionState === 'connecting'
									? 'amber'
									: connectionState === 'error'
										? 'red'
										: 'gray'
						}
						variant="subtle"
					>
						{connectionState === 'connected'
							? '音声接続中'
							: connectionState === 'connecting'
								? '接続中'
								: connectionState === 'error'
									? '接続エラー'
									: '未接続'}
					</Badge>
					<Badge colorScheme={microphoneState === 'on' ? 'red' : 'gray'} variant="subtle">
						{microphoneState === 'on'
							? 'Mic ON'
							: microphoneState === 'requesting'
								? 'Mic 要求中'
								: 'Mic OFF'}
					</Badge>
					<Badge colorScheme={snapshot.session ? 'green' : 'gray'} variant="subtle">
						{snapshot.session ? getSessionStatusLabel(snapshot.session.status) : '未開始'}
					</Badge>
					{snapshot.session ? (
						<Badge colorScheme="teal" variant="subtle">
							STEP{' '}
							{snapshot.plan.document.steps.findIndex(
								(step) => step.id === snapshot.currentStep?.id,
							) + 1}
						</Badge>
					) : null}
				</Flex>
			</Flex>

			<Flex direction={{ base: 'column', xl: 'row' }} gap="lg">
				<VStack align="stretch" flex="1.75" gap="lg">
					<Card.Root variant="outline">
						<Card.Body gap="md">
							<Flex align="center" justify="space-between" gap="md" wrap="wrap">
								<VStack align="stretch" gap="xs">
									<Text color="fg.subtle" fontSize="sm">
										現在ステップ
									</Text>
									<Heading size="md">{snapshot.currentStep?.label ?? 'ステップ未設定'}</Heading>
								</VStack>
								<Text color="fg.subtle">
									{snapshot.currentStep ? `${snapshot.currentStep.time}分` : 'まだ開始していません'}
								</Text>
							</Flex>

							<Text whiteSpace="pre-wrap">
								{snapshot.currentStep?.instructions ??
									'調理セッションを開始すると、ここに現在の手順が表示されます。'}
							</Text>

							<Separator />

							<VStack align="stretch" gap="sm">
								<Text fontWeight="semibold">今使う材料</Text>
								{currentMaterials.length > 0 ? (
									currentMaterials.map((material) => <Text key={material}>{material}</Text>)
								) : (
									<Text color="fg.subtle">このステップに紐づく材料はまだありません。</Text>
								)}
							</VStack>

							<Separator />

							<VStack align="stretch" gap="sm">
								<Text fontWeight="semibold">注意とリカバリー</Text>
								{snapshot.currentStep?.notesForUser?.length ? (
									snapshot.currentStep.notesForUser.map((note) => <Text key={note}>{note}</Text>)
								) : (
									<Text color="fg.subtle">注意事項はまだありません。</Text>
								)}
								{snapshot.currentStep?.recoveryTips?.length ? (
									<>
										<Text fontWeight="semibold">リカバリー</Text>
										{snapshot.currentStep.recoveryTips.map((tip) => (
											<Text key={tip}>{tip}</Text>
										))}
									</>
								) : null}
							</VStack>

							<Flex gap="sm" wrap="wrap">
								{snapshot.session ? (
									<>
										<Button
											disabled={isPending}
											onClick={() => void applyAction({ type: 'complete_step' })}
										>
											次へ
										</Button>
										<Button
											disabled={connectionState === 'connecting'}
											onClick={() =>
												void (connectionState === 'connected' ? disconnect() : connect())
											}
											variant="outline"
										>
											{connectionState === 'connected' ? '接続終了' : '音声接続'}
										</Button>
										<Button
											disabled={connectionState !== 'connected'}
											onClick={() => void toggleMicrophone()}
											variant="outline"
										>
											{microphoneState === 'on' ? 'Mic停止' : 'Mic開始'}
										</Button>
										<Button
											disabled={isPending}
											onClick={() =>
												void applyAction({
													type:
														snapshot.session?.status === 'paused'
															? 'resume_session'
															: 'pause_session',
												})
											}
											variant="outline"
										>
											{snapshot.session.status === 'paused' ? '再開' : '一時停止'}
										</Button>
									</>
								) : (
									<Button disabled={isPending} onClick={() => void startSession()}>
										調理を開始
									</Button>
								)}
							</Flex>
						</Card.Body>
					</Card.Root>

					<Card.Root variant="outline">
						<Card.Body gap="sm">
							<Heading size="sm">以降の手順</Heading>
							{snapshot.upcomingSteps.length > 0 ? (
								snapshot.upcomingSteps.map((step) => (
									<Flex key={step.id} align="center" justify="space-between" gap="sm">
										<VStack align="stretch" gap="xs">
											<Text fontWeight="medium">{step.label}</Text>
											<Text color="fg.subtle" fontSize="sm" lineClamp={2}>
												{step.instructions}
											</Text>
										</VStack>
										{snapshot.session ? (
											<Button
												disabled={isPending}
												onClick={() => void applyAction({ stepId: step.id, type: 'move_to_step' })}
												variant="ghost"
											>
												移動
											</Button>
										) : null}
									</Flex>
								))
							) : (
								<Text color="fg.subtle">残りの手順はありません。</Text>
							)}
						</Card.Body>
					</Card.Root>
				</VStack>

				<VStack align="stretch" flex="1" gap="lg">
					<Card.Root variant="outline">
						<Card.Body gap="sm">
							<Heading size="sm">次ステップ</Heading>
							{snapshot.nextStep ? (
								<>
									<Text fontWeight="medium">{snapshot.nextStep.label}</Text>
									<Text color="fg.subtle" lineClamp={4}>
										{snapshot.nextStep.instructions}
									</Text>
								</>
							) : (
								<Text color="fg.subtle">次の手順はまだありません。</Text>
							)}
						</Card.Body>
					</Card.Root>

					<Card.Root variant="outline">
						<Card.Body gap="sm">
							<Heading size="sm">タイマー</Heading>
							{primaryTimer ? (
								<>
									<Text fontSize="2xl" fontWeight="black">
										{getTimerDisplaySeconds(primaryTimer)}秒
									</Text>
									<Text>{primaryTimer.label}</Text>
									<Flex gap="sm" wrap="wrap">
										{primaryTimer.status === 'running' ? (
											<Button
												disabled={isPending}
												onClick={() =>
													void applyAction({ timerRowId: primaryTimer.id, type: 'pause_timer' })
												}
												variant="outline"
											>
												停止
											</Button>
										) : primaryTimer.status === 'paused' ? (
											<Button
												disabled={isPending}
												onClick={() =>
													void applyAction({ timerRowId: primaryTimer.id, type: 'resume_timer' })
												}
											>
												再開
											</Button>
										) : null}
										<Button
											disabled={isPending}
											onClick={() =>
												void applyAction({ timerRowId: primaryTimer.id, type: 'cancel_timer' })
											}
											variant="ghost"
										>
											キャンセル
										</Button>
									</Flex>
								</>
							) : snapshot.currentStep?.timers?.length && snapshot.session ? (
								snapshot.currentStep.timers.map((timer) => (
									<Flex key={timer.id} align="center" justify="space-between" gap="sm">
										<VStack align="stretch" gap="xs">
											<Text fontWeight="medium">{timer.label}</Text>
											<Text color="fg.subtle">{timer.seconds}秒</Text>
										</VStack>
										<Button
											disabled={isPending}
											onClick={() =>
												void applyAction({
													stepId: snapshot.currentStep?.id,
													timerId: timer.id,
													type: 'start_timer',
												})
											}
										>
											開始
										</Button>
									</Flex>
								))
							) : (
								<Text color="fg.subtle">動作中のタイマーはありません。</Text>
							)}
							{secondaryTimers.length > 0 ? (
								<VStack align="stretch" gap="xs">
									<Text fontWeight="semibold">他のタイマー</Text>
									{secondaryTimers.map((timer) => (
										<Text key={timer.id} color="fg.subtle" fontSize="sm">
											{timer.label}: {getTimerDisplaySeconds(timer)}秒
										</Text>
									))}
								</VStack>
							) : null}
						</Card.Body>
					</Card.Root>

					<Card.Root variant="outline">
						<Card.Body gap="sm">
							<Heading size="sm">Transcript / Recent Events</Heading>
							{transcriptPreview.length > 0 ? (
								<>
									{transcriptPreview.map((entry) => (
										<VStack key={entry.id} align="stretch" gap="xs">
											<Text fontSize="sm">{entry.text}</Text>
											<Text color="fg.subtle" fontSize="xs">
												{new Date(entry.createdAt).toLocaleTimeString('ja-JP')}
											</Text>
										</VStack>
									))}
									{transcriptEntries.length > 6 ? (
										<Button
											onClick={() => setIsTranscriptExpanded((currentState) => !currentState)}
											variant="ghost"
										>
											{isTranscriptExpanded ? '閉じる' : 'もっと見る'}
										</Button>
									) : null}
								</>
							) : (
								<Text color="fg.subtle">まだイベントはありません。</Text>
							)}
						</Card.Body>
					</Card.Root>
				</VStack>
			</Flex>
		</VStack>
	);
};
