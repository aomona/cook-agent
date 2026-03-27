'use client';

import { Badge, Card, ClientOnly, Flex, ScrollArea, Text, VStack } from '@workspaces/ui';
import dayjs from 'dayjs';
import Timeline, {
	DateHeader,
	type TimelineGroupBase,
	TimelineHeaders,
	type TimelineItemBase,
} from 'react-calendar-timeline';
import type { PlanDocument } from '@/lib/plans/types';

type PlanTimelineProps = {
	plan: PlanDocument;
	recipeTitleById: Record<string, string>;
};

type PlanTimelineGroup = TimelineGroupBase & {
	color: string;
};

type PlanTimelineItem = TimelineItemBase<number> & {
	canParallelize: boolean;
	description: string;
	durationMinutes: number;
	groupColor: string;
	stepNumber: number;
};

const MINUTE_MS = 60 * 1000;
const DEFAULT_GROUP_ID = 'shared';
const GROUP_COLORS = ['#2563eb', '#d97706', '#059669', '#dc2626', '#7c3aed', '#0891b2'];

const buildTimelineData = ({
	plan,
	recipeTitleById,
}: PlanTimelineProps): {
	defaultTimeEnd: number;
	defaultTimeStart: number;
	groups: PlanTimelineGroup[];
	items: PlanTimelineItem[];
	totalMinutes: number;
} => {
	const groups: PlanTimelineGroup[] = [
		{
			color: '#475569',
			id: DEFAULT_GROUP_ID,
			stackItems: true,
			title: '共通作業',
		},
	];
	const groupIds = new Set<string>([DEFAULT_GROUP_ID]);
	let colorIndex = 0;

	for (const step of plan.steps) {
		if (!step.recipeSourceId || groupIds.has(step.recipeSourceId)) {
			continue;
		}

		groups.push({
			color: GROUP_COLORS[colorIndex % GROUP_COLORS.length] ?? '#2563eb',
			id: step.recipeSourceId,
			stackItems: true,
			title: recipeTitleById[step.recipeSourceId] ?? step.recipeSourceId,
		});
		groupIds.add(step.recipeSourceId);
		colorIndex += 1;
	}

	const groupColorById = new Map(groups.map((group) => [String(group.id), group.color]));
	const stepEndMinuteById = new Map<string, number>();
	const items: PlanTimelineItem[] = [];
	let sequentialCursor = 0;

	for (const [index, step] of plan.steps.entries()) {
		const dependencyEndMinute =
			step.dependencies.reduce((latestMinute, dependencyId) => {
				const dependencyEnd = stepEndMinuteById.get(dependencyId) ?? 0;

				return Math.max(latestMinute, dependencyEnd);
			}, 0) ?? 0;
		const startMinute = step.canParallelize
			? dependencyEndMinute
			: Math.max(dependencyEndMinute, sequentialCursor);
		const endMinute = startMinute + step.estimatedMinutes;
		const groupId =
			step.recipeSourceId && groupIds.has(step.recipeSourceId)
				? step.recipeSourceId
				: DEFAULT_GROUP_ID;
		const groupColor = groupColorById.get(groupId) ?? '#475569';

		stepEndMinuteById.set(step.id, endMinute);

		if (!step.canParallelize) {
			sequentialCursor = endMinute;
		}

		items.push({
			canParallelize: step.canParallelize,
			description: step.description,
			durationMinutes: step.estimatedMinutes,
			end_time: dayjs().startOf('hour').add(endMinute, 'minute').valueOf(),
			group: groupId,
			groupColor,
			id: step.id,
			itemProps: {
				title: `${step.title} (${step.estimatedMinutes}分)`,
			},
			start_time: dayjs().startOf('hour').add(startMinute, 'minute').valueOf(),
			stepNumber: index + 1,
			title: step.title,
		});
	}

	const totalMinutes = Math.max(
		...items.map((item) => dayjs(item.end_time).diff(dayjs().startOf('hour'), 'minute')),
		0,
	);
	const defaultTimeStart = dayjs().startOf('hour').add(-5, 'minute').valueOf();
	const defaultTimeEnd = dayjs()
		.startOf('hour')
		.add(Math.max(totalMinutes + 10, 45), 'minute')
		.valueOf();

	return {
		defaultTimeEnd,
		defaultTimeStart,
		groups,
		items,
		totalMinutes,
	};
};

export const PlanTimeline = ({ plan, recipeTitleById }: PlanTimelineProps) => {
	const { defaultTimeEnd, defaultTimeStart, groups, items, totalMinutes } = buildTimelineData({
		plan,
		recipeTitleById,
	});

	return (
		<Card.Root variant="outline">
			<Card.Body gap="md">
				<Flex align="center" justify="space-between" gap="sm" wrap="wrap">
					<VStack align="stretch" gap="xs">
						<Text fontSize="lg" fontWeight="semibold">
							タイムライン
						</Text>
						<Text color="fg.subtle" fontSize="sm">
							dependencies と並行可否から推定した実行スケジュールです。
						</Text>
					</VStack>
					<Badge colorScheme="blue" variant="subtle">
						推定 {totalMinutes} 分
					</Badge>
				</Flex>

				<ClientOnly fallback={<Text color="fg.subtle">タイムラインを読み込んでいます。</Text>}>
					<ScrollArea h="28rem" w="full">
						<div className="plan-timeline">
							<Timeline<PlanTimelineItem, PlanTimelineGroup>
								canChangeGroup={false}
								canMove={false}
								canResize={false}
								defaultTimeEnd={defaultTimeEnd}
								defaultTimeStart={defaultTimeStart}
								groups={groups}
								itemHeightRatio={0.76}
								items={items}
								lineHeight={64}
								minZoom={30 * MINUTE_MS}
								sidebarWidth={180}
								stackItems
								itemRenderer={({ getItemProps, item, itemContext }) => (
									<div
										{...getItemProps({
											style: {
												background: item.groupColor,
												border: itemContext.selected ? `2px solid ${item.groupColor}` : 'none',
												borderRadius: 14,
												boxShadow: '0 10px 24px rgba(15, 23, 42, 0.14)',
												color: '#fff',
												overflow: 'hidden',
											},
										})}
									>
										<div
											style={{
												display: 'flex',
												flexDirection: 'column',
												gap: 2,
												height: '100%',
												justifyContent: 'center',
												padding: '8px 10px',
											}}
										>
											<div
												style={{
													fontSize: 11,
													fontWeight: 700,
													letterSpacing: '0.08em',
													opacity: 0.82,
													textTransform: 'uppercase',
												}}
											>
												Step {item.stepNumber}
											</div>
											<div
												style={{
													fontSize: 13,
													fontWeight: 700,
													lineHeight: 1.2,
													overflow: 'hidden',
													textOverflow: 'ellipsis',
													whiteSpace: 'nowrap',
												}}
											>
												{item.title}
											</div>
											<div
												style={{
													fontSize: 11,
													opacity: 0.88,
													overflow: 'hidden',
													textOverflow: 'ellipsis',
													whiteSpace: 'nowrap',
												}}
											>
												{item.durationMinutes}分 {item.canParallelize ? '• 並行可' : '• 直列'}
											</div>
										</div>
									</div>
								)}
							>
								<TimelineHeaders>
									<DateHeader unit="primaryHeader" />
									<DateHeader />
								</TimelineHeaders>
							</Timeline>
						</div>
					</ScrollArea>
				</ClientOnly>
			</Card.Body>
		</Card.Root>
	);
};
