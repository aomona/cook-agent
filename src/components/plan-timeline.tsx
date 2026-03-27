'use client';

import { Badge, Card, ClientOnly, Flex, ScrollArea, Text, VStack } from '@workspaces/ui';
import dayjs from 'dayjs';
import Timeline, {
	DateHeader,
	type TimelineGroupBase,
	TimelineHeaders,
	type TimelineItemBase,
} from 'react-calendar-timeline';
import { buildPlanTimelineData } from '@/lib/plans/timeline';
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

export const PlanTimeline = ({ plan, recipeTitleById }: PlanTimelineProps) => {
	const {
		groups,
		items: timelineItems,
		totalMinutes,
	} = buildPlanTimelineData({
		plan,
		recipeTitleById,
	});
	const timelineBase = dayjs().startOf('hour');
	const items: PlanTimelineItem[] = timelineItems.map((item) => ({
		...item,
		end_time: timelineBase.add(item.endMinute, 'minute').valueOf(),
		itemProps: {
			title: `${item.title} (${item.durationMinutes}分)`,
		},
		start_time: timelineBase.add(item.startMinute, 'minute').valueOf(),
	}));
	const defaultTimeStart = timelineBase.add(-5, 'minute').valueOf();
	const defaultTimeEnd = timelineBase.add(Math.max(totalMinutes + 10, 45), 'minute').valueOf();

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
