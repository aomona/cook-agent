'use client';

import { Badge, Card, ClientOnly, Flex, ScrollArea, Text, VStack } from '@workspaces/ui';
import { computeConflicts, getResourceLabel } from '@/lib/plans/scheduler';
import { buildPlanTimelineData } from '@/lib/plans/timeline';
import type { PlanDocument, PlanStep } from '@/lib/plans/types';

type PlanTimelineProps = {
	plan: PlanDocument;
	recipeTitleById: Record<string, string>;
	editable?: boolean;
};

const getKindColor = (kind: PlanStep['kind']): string => {
	switch (kind) {
		case 'cleanup':
			return '#d97706';
		case 'cook':
			return '#2563eb';
		case 'finish':
			return '#8b5cf6';
		case 'prep':
			return '#10b981';
		case 'wait':
			return '#22c55e';
		default:
			return '#475569';
	}
};

const getTimelineMaxMinutes = (totalMinutes: number): number => {
	if (totalMinutes <= 45) {
		return 45;
	}

	return Math.ceil((totalMinutes + 5) / 5) * 5;
};

const getTimeMarks = (maxMinutes: number): number[] => {
	const interval = maxMinutes <= 30 ? 5 : maxMinutes <= 60 ? 10 : 15;
	const marks: number[] = [];

	for (let minute = 0; minute <= maxMinutes; minute += interval) {
		marks.push(minute);
	}

	if (marks[marks.length - 1] !== maxMinutes) {
		marks.push(maxMinutes);
	}

	return marks;
};

const deriveCapacity = (plan: PlanDocument): Record<string, number> => {
	const normalized = (plan.metadata?.availableEquipment ?? []).map((equipment) =>
		equipment.toLowerCase(),
	);

	return {
		hands: 1,
		oven:
			normalized.filter((equipment) => equipment.includes('oven') || equipment.includes('オーブン'))
				.length || 1,
		stove:
			normalized.filter(
				(equipment) =>
					equipment.includes('stove') ||
					equipment.includes('burner') ||
					equipment.includes('コンロ') ||
					equipment.includes('バーナー'),
			).length || 1,
	};
};

const formatReq = (req: Record<string, number>): string =>
	Object.entries(req)
		.map(([resource, amount]) => `${getResourceLabel(resource)}:${amount}`)
		.join(' / ');

export const PlanTimeline = ({ editable = false, plan, recipeTitleById }: PlanTimelineProps) => {
	const { items, totalMinutes } = buildPlanTimelineData({
		plan,
		recipeTitleById,
	});
	const maxMinutes = getTimelineMaxMinutes(totalMinutes);
	const marks = getTimeMarks(maxMinutes);
	const conflicts = computeConflicts(plan.steps, deriveCapacity(plan));
	const timelineMinWidth = Math.max(maxMinutes * 14, 840);

	return (
		<Card.Root variant="outline">
			<Card.Body gap="md">
				<Flex align="center" justify="space-between" gap="sm" wrap="wrap">
					<VStack align="stretch" gap="xs">
						<Text fontSize="lg" fontWeight="semibold">
							タイムライン
						</Text>
						<Text color="fg.subtle" fontSize="sm">
							明示的な timeline / resource / slack をもとに描画した実行スケジュールです。
						</Text>
					</VStack>
					<Flex gap="sm" wrap="wrap">
						<Badge colorScheme="blue" variant="subtle">
							計画 {totalMinutes} 分
						</Badge>
						{editable ? (
							<Badge colorScheme="amber" variant="subtle">
								編集モード
							</Badge>
						) : null}
					</Flex>
				</Flex>

				{conflicts.length > 0 ? (
					<Card.Root borderColor="red.200" bg="red.50" variant="outline">
						<Card.Body gap="xs">
							<Text color="red.700" fontSize="sm" fontWeight="semibold">
								リソース競合があります
							</Text>
							{conflicts.map((conflict) => (
								<Text
									key={`${conflict.res}-${conflict.start}-${conflict.end}`}
									color="red.700"
									fontSize="sm"
								>
									{conflict.text}
								</Text>
							))}
						</Card.Body>
					</Card.Root>
				) : null}

				<ClientOnly fallback={<Text color="fg.subtle">タイムラインを読み込んでいます。</Text>}>
					<ScrollArea h="34rem" w="full">
						<div className="plan-timeline-shell" style={{ minWidth: `${timelineMinWidth}px` }}>
							<div className="plan-timeline-ruler">
								<div className="plan-timeline-ruler-labels">
									{marks.map((mark) => (
										<span key={mark}>{mark}分</span>
									))}
								</div>
								<div className="plan-timeline-ruler-track">
									{marks.map((mark) => (
										<div
											key={mark}
											className="plan-timeline-grid-line"
											style={{ left: `${(mark / maxMinutes) * 100}%` }}
										/>
									))}
									{conflicts.map((conflict) => (
										<div
											key={`${conflict.res}-${conflict.start}-${conflict.end}`}
											className="plan-timeline-conflict"
											style={{
												left: `${(conflict.start / maxMinutes) * 100}%`,
												width: `${((conflict.end - conflict.start) / maxMinutes) * 100}%`,
											}}
										/>
									))}
								</div>
							</div>

							<div className="plan-timeline-rows">
								{items.map((item) => {
									const recipeLabel = item.recipeSourceId
										? (recipeTitleById[item.recipeSourceId] ?? item.recipeSourceId)
										: null;
									const left = (item.startMinute / maxMinutes) * 100;
									const width = ((item.endMinute - item.startMinute) / maxMinutes) * 100;
									const slackWidth =
										item.slack > 0 ? ((item.durationMinutes + item.slack) / maxMinutes) * 100 : 0;

									return (
										<div key={item.id} className="plan-timeline-row">
											<div className="plan-timeline-row-track">
												{marks.map((mark) => (
													<div
														key={`${item.id}-${mark}`}
														className="plan-timeline-row-grid-line"
														style={{ left: `${(mark / maxMinutes) * 100}%` }}
													/>
												))}

												{item.slack > 0 ? (
													<div
														className="plan-timeline-step-slack"
														style={{
															left: `${left}%`,
															width: `${slackWidth}%`,
														}}
													/>
												) : null}

												<div
													className="plan-timeline-step-bar"
													style={{
														background: getKindColor(item.kind as PlanStep['kind']),
														left: `${left}%`,
														width: `${Math.max(width, 2.8)}%`,
													}}
												>
													<span className="plan-timeline-step-text">
														{recipeLabel ? `[${recipeLabel}] ` : ''}
														{item.title}
													</span>
												</div>

												<div className="plan-timeline-row-meta">
													<Text fontSize="sm">
														{recipeLabel ? `[${recipeLabel}] ` : ''}
														{item.title}
													</Text>
													<Flex align="center" gap="xs" wrap="wrap">
														<Badge colorScheme={item.isCleanup ? 'amber' : 'blue'} variant="subtle">
															{item.kind}
														</Badge>
														{Object.keys(item.req).length > 0 ? (
															<Badge colorScheme="blackAlpha" variant="subtle">
																{formatReq(item.req)}
															</Badge>
														) : null}
														{item.slack > 0 ? (
															<Badge colorScheme="green" variant="subtle">
																slack {item.slack}分
															</Badge>
														) : null}
													</Flex>
													<Text color="fg.subtle" fontSize="sm">
														{item.startMinute}-{item.endMinute}分
													</Text>
												</div>
											</div>
										</div>
									);
								})}
							</div>
						</div>
					</ScrollArea>
				</ClientOnly>
			</Card.Body>
		</Card.Root>
	);
};
