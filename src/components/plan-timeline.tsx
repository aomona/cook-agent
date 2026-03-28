'use client';

import {
	Badge,
	Box,
	Card,
	ClientOnly,
	Flex,
	Text,
	useColorModeValue,
	VStack,
} from '@workspaces/ui';
import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	computeConflicts,
	type PlanConflict,
	type PlanResourceCapacity,
} from '@/lib/plans/scheduler';
import {
	buildPlanTimelineData,
	DARK_PLAN_TIMELINE_PALETTE,
	LIGHT_PLAN_TIMELINE_PALETTE,
	type PlanTimelineItemData,
} from '@/lib/plans/timeline';
import type { PlanDocument } from '@/lib/plans/types';

type PlanTimelineProps = {
	plan: PlanDocument;
	recipeTitleById: Record<string, string>;
	editable?: boolean;
};

type TimelineMetrics = {
	conflicts: PlanConflict[];
	items: PlanTimelineItemData[];
	marks: number[];
	maxMinutes: number;
	totalMinutes: number;
};

const MIN_ZOOM_PERCENT = 100;
const MAX_ZOOM_PERCENT = 300;
const ZOOM_STEP_PERCENT = 10;
const MIN_STEP_BAR_WIDTH_PX = 44;
const TIMELINE_LOADING_MESSAGE = 'タイムラインを読み込んでいます。';

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

const getTimelinePercent = (minute: number, maxMinutes: number): number =>
	(minute / maxMinutes) * 100;

const getTimelineLength = ({
	maxMinutes,
	minute,
	pixelsPerMinute,
}: {
	maxMinutes: number;
	minute: number;
	pixelsPerMinute: number;
}): string =>
	pixelsPerMinute > 0
		? `${minute * pixelsPerMinute}px`
		: `${getTimelinePercent(minute, maxMinutes)}%`;

const getConflictKey = (conflict: Pick<PlanConflict, 'end' | 'res' | 'start'>): string =>
	`${conflict.res}-${conflict.start}-${conflict.end}`;

const clampZoomPercent = (zoomPercent: number): number =>
	Math.min(MAX_ZOOM_PERCENT, Math.max(MIN_ZOOM_PERCENT, zoomPercent));

const getEquipmentCount = (value: string): number => {
	const match = value.match(/[x×]\s*(\d+)/i);

	if (!match) {
		return 1;
	}

	const parsedCount = Number.parseInt(match[1], 10);

	return Number.isNaN(parsedCount) ? 1 : parsedCount;
};

const deriveCapacity = (plan: PlanDocument): PlanResourceCapacity => {
	const capacity: PlanResourceCapacity = {
		hands: 1,
		oven: 0,
		stove: 0,
	};

	const structuredEquipment = plan.metadata?.planningSettings?.equipment;

	if (structuredEquipment) {
		capacity.oven = structuredEquipment.oven;
		capacity.stove = structuredEquipment.stove;
	}

	for (const equipment of plan.metadata?.availableEquipment ?? []) {
		const normalizedEquipment = equipment.toLowerCase();
		const count = getEquipmentCount(equipment);

		if (
			!structuredEquipment &&
			(normalizedEquipment.includes('oven') || normalizedEquipment.includes('オーブン'))
		) {
			capacity.oven += count;
		}

		if (
			!structuredEquipment &&
			(normalizedEquipment.includes('stove') ||
				normalizedEquipment.includes('burner') ||
				normalizedEquipment.includes('コンロ') ||
				normalizedEquipment.includes('バーナー'))
		) {
			capacity.stove += count;
		}
	}

	return {
		...capacity,
		oven: capacity.oven || 1,
		stove: capacity.stove || 1,
	};
};

const TimelineStatusBadges = ({
	editable,
	totalMinutes,
	zoomPercent,
}: {
	editable: boolean;
	totalMinutes: number;
	zoomPercent: number;
}) => (
	<Flex gap="sm" wrap="wrap">
		<Badge colorScheme="blue" variant="subtle">
			計画 {totalMinutes} 分
		</Badge>
		<Badge colorScheme="gray" variant="subtle">
			横幅 {zoomPercent}%
		</Badge>
		{editable ? (
			<Badge colorScheme="amber" variant="subtle">
				編集モード
			</Badge>
		) : null}
	</Flex>
);

const TimelineConflictAlert = ({ conflicts }: { conflicts: PlanConflict[] }) => {
	const conflictAlertBackground = useColorModeValue('red.50', 'rgba(127, 29, 29, 0.24)');
	const conflictAlertBorder = useColorModeValue('red.200', 'rgba(252, 165, 165, 0.3)');
	const conflictAlertText = useColorModeValue('red.700', 'red.200');

	if (conflicts.length === 0) {
		return null;
	}

	return (
		<Card.Root bg={conflictAlertBackground} borderColor={conflictAlertBorder} variant="outline">
			<Card.Body gap="xs">
				<Text color={conflictAlertText} fontSize="sm" fontWeight="semibold">
					リソース競合があります
				</Text>
				{conflicts.map((conflict) => (
					<Text key={getConflictKey(conflict)} color={conflictAlertText} fontSize="sm">
						{conflict.text}
					</Text>
				))}
			</Card.Body>
		</Card.Root>
	);
};

const TimelineRuler = ({
	pixelsPerMinute,
	conflicts,
	marks,
	maxMinutes,
}: {
	pixelsPerMinute: number;
	conflicts: PlanConflict[];
	marks: number[];
	maxMinutes: number;
}) => (
	<div className="plan-timeline-ruler">
		<div className="plan-timeline-ruler-labels">
			{marks.map((mark) => (
				<span
					key={mark}
					className="plan-timeline-ruler-label"
					style={{ left: getTimelineLength({ maxMinutes, minute: mark, pixelsPerMinute }) }}
				>
					{mark}分
				</span>
			))}
		</div>
		<div className="plan-timeline-ruler-track">
			{marks.map((mark) => (
				<div
					key={mark}
					className="plan-timeline-grid-line"
					style={{ left: getTimelineLength({ maxMinutes, minute: mark, pixelsPerMinute }) }}
				/>
			))}
			{conflicts.map((conflict) => (
				<div
					key={getConflictKey(conflict)}
					className="plan-timeline-conflict"
					style={{
						left: getTimelineLength({
							maxMinutes,
							minute: conflict.start,
							pixelsPerMinute,
						}),
						width: getTimelineLength({
							maxMinutes,
							minute: conflict.end - conflict.start,
							pixelsPerMinute,
						}),
					}}
				/>
			))}
		</div>
	</div>
);

const TimelineRow = ({
	item,
	marks,
	maxMinutes,
	pixelsPerMinute,
}: {
	item: PlanTimelineItemData;
	marks: number[];
	maxMinutes: number;
	pixelsPerMinute: number;
}) => {
	const left = getTimelineLength({
		maxMinutes,
		minute: item.startMinute,
		pixelsPerMinute,
	});
	const width = getTimelineLength({
		maxMinutes,
		minute: item.endMinute - item.startMinute,
		pixelsPerMinute,
	});
	const slackWidth =
		item.slack > 0
			? getTimelineLength({
					maxMinutes,
					minute: item.durationMinutes + item.slack,
					pixelsPerMinute,
				})
			: null;
	const minimumStepBarWidth = pixelsPerMinute > 0 ? `${MIN_STEP_BAR_WIDTH_PX}px` : '2.8%';

	return (
		<div className="plan-timeline-row">
			<div className="plan-timeline-row-track">
				{marks.map((mark) => (
					<div
						key={`${item.id}-${mark}`}
						className="plan-timeline-row-grid-line"
						style={{ left: getTimelineLength({ maxMinutes, minute: mark, pixelsPerMinute }) }}
					/>
				))}

				{slackWidth ? (
					<div
						className="plan-timeline-step-slack"
						style={{
							left,
							width: slackWidth,
						}}
					/>
				) : null}

				<div
					className="plan-timeline-step-bar"
					style={{
						background: item.groupColor,
						left,
						minWidth: minimumStepBarWidth,
						width,
					}}
				>
					<span className="plan-timeline-step-text">{item.stepNumber}</span>
				</div>
			</div>
		</div>
	);
};

const TimelineCanvas = ({
	conflicts,
	items,
	marks,
	maxMinutes,
	onWheel,
	zoomPercent,
}: {
	conflicts: PlanConflict[];
	items: PlanTimelineItemData[];
	marks: number[];
	maxMinutes: number;
	onWheel: (event: WheelEvent) => void;
	zoomPercent: number;
}) => {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [containerWidth, setContainerWidth] = useState(0);

	useEffect(() => {
		const element = containerRef.current;

		if (!element) {
			return;
		}

		setContainerWidth(element.clientWidth);

		const resizeObserver = new ResizeObserver((entries) => {
			const entry = entries[0];

			if (!entry) {
				return;
			}

			setContainerWidth(entry.contentRect.width);
		});

		resizeObserver.observe(element);
		element.addEventListener('wheel', onWheel, { passive: false });

		return () => {
			resizeObserver.disconnect();
			element.removeEventListener('wheel', onWheel);
		};
	}, [onWheel]);

	const timelineWidth =
		containerWidth > 0 ? `${(containerWidth * zoomPercent) / 100}px` : `${zoomPercent}%`;
	const pixelsPerMinute =
		containerWidth > 0 ? (containerWidth * zoomPercent) / 100 / maxMinutes : 0;

	return (
		<Box
			ref={containerRef}
			h="34rem"
			style={{ minWidth: 0, overflowX: 'auto', overflowY: 'auto', width: '100%' }}
		>
			<Box
				className="plan-timeline-shell"
				style={{
					minWidth: '100%',
					width: timelineWidth,
				}}
			>
				<TimelineRuler
					conflicts={conflicts}
					marks={marks}
					maxMinutes={maxMinutes}
					pixelsPerMinute={pixelsPerMinute}
				/>

				<div className="plan-timeline-rows">
					{items.map((item) => (
						<TimelineRow
							key={item.id}
							item={item}
							marks={marks}
							maxMinutes={maxMinutes}
							pixelsPerMinute={pixelsPerMinute}
						/>
					))}
				</div>
			</Box>
		</Box>
	);
};

export const PlanTimeline = ({ editable = false, plan, recipeTitleById }: PlanTimelineProps) => {
	const timelinePalette = useColorModeValue(
		LIGHT_PLAN_TIMELINE_PALETTE,
		DARK_PLAN_TIMELINE_PALETTE,
	);
	const conflictOverlayColor = useColorModeValue(
		'color-mix(in srgb, var(--ui-colors-red-500, #ef4444) 38%, transparent)',
		'color-mix(in srgb, var(--ui-colors-red-300, #fca5a5) 24%, transparent)',
	);
	const stepTextColor = useColorModeValue('#ffffff', '#f8fafc');
	const [zoomPercent, setZoomPercent] = useState(MIN_ZOOM_PERCENT);
	const { conflicts, items, marks, maxMinutes, totalMinutes } = useMemo<TimelineMetrics>(() => {
		const { items, totalMinutes } = buildPlanTimelineData({
			palette: timelinePalette,
			plan,
			recipeTitleById,
		});
		const maxMinutes = getTimelineMaxMinutes(totalMinutes);

		return {
			conflicts: computeConflicts(plan.steps, deriveCapacity(plan)),
			items,
			marks: getTimeMarks(maxMinutes),
			maxMinutes,
			totalMinutes,
		};
	}, [plan, recipeTitleById, timelinePalette]);
	const timelineCssVariables = useMemo(
		() =>
			({
				'--plan-timeline-conflict-color': conflictOverlayColor,
				'--plan-timeline-step-text-color': stepTextColor,
			}) as CSSProperties,
		[conflictOverlayColor, stepTextColor],
	);
	const handleWheel = useCallback((event: WheelEvent) => {
		if (!event.ctrlKey) {
			return;
		}

		event.preventDefault();
		setZoomPercent((currentZoom) => {
			const delta = event.deltaY < 0 ? ZOOM_STEP_PERCENT : -ZOOM_STEP_PERCENT;
			return clampZoomPercent(currentZoom + delta);
		});
	}, []);

	return (
		<Card.Root style={timelineCssVariables} variant="outline">
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
					<TimelineStatusBadges
						editable={editable}
						totalMinutes={totalMinutes}
						zoomPercent={zoomPercent}
					/>
				</Flex>

				<Text color="fg.subtle" fontSize="sm">
					タイムライン上は手順番号のみ表示します。`Ctrl + スクロール` で横方向だけ拡大できます。
				</Text>

				<TimelineConflictAlert conflicts={conflicts} />

				<ClientOnly fallback={<Text color="fg.subtle">{TIMELINE_LOADING_MESSAGE}</Text>}>
					<TimelineCanvas
						conflicts={conflicts}
						items={items}
						marks={marks}
						maxMinutes={maxMinutes}
						onWheel={handleWheel}
						zoomPercent={zoomPercent}
					/>
				</ClientOnly>
			</Card.Body>
		</Card.Root>
	);
};
