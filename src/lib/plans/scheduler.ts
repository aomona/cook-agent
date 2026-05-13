import type { PlanStep } from '@/lib/plans/types';

export type PlanResourceCapacity = Record<string, number>;

export type PlanConflict = {
	res: string;
	start: number;
	end: number;
	usage: number;
	cap: number;
	culprits: string[];
	text: string;
};

type ScheduledInterval = {
	id: string;
	start: number;
	end: number;
	req: Record<string, number>;
};

const resourceLabelMap: Record<string, string> = {
	hands: '手作業',
	oven: 'オーブン',
	stove: 'コンロ',
};

const getStepDuration = (step: Pick<PlanStep, 'time' | 'timeline'>): number =>
	step.time || Math.max(0, step.timeline.end - step.timeline.start);

export const getResourceLabel = (resourceKey: string): string =>
	resourceLabelMap[resourceKey] ?? resourceKey;

export const clonePlanSteps = (steps: PlanStep[]): PlanStep[] =>
	steps.map((step) => ({
		...step,
		after: [...step.after],
		timeline: { ...step.timeline },
		recoveryTips: step.recoveryTips ? [...step.recoveryTips] : undefined,
		req: step.req ? { ...step.req } : undefined,
		tags: step.tags ? [...step.tags] : undefined,
		timers: step.timers ? step.timers.map((timer) => ({ ...timer })) : undefined,
		uses: step.uses ? [...step.uses] : undefined,
		notesForUser: step.notesForUser ? [...step.notesForUser] : undefined,
		outputs: step.outputs ? [...step.outputs] : undefined,
	}));

export const computeConflicts = (
	steps: Pick<PlanStep, 'id' | 'req' | 'timeline'>[],
	capacity: PlanResourceCapacity,
): PlanConflict[] => {
	const resources = new Set<string>();

	for (const step of steps) {
		for (const key of Object.keys(step.req ?? {})) {
			resources.add(key);
		}
	}

	if (resources.size === 0) {
		return [];
	}

	const events: Array<{ req: Record<string, number>; t: number; type: 'start' | 'end' }> = [];

	for (const step of steps) {
		if (!step.timeline || !step.req) {
			continue;
		}

		events.push({ req: step.req, t: step.timeline.start, type: 'start' });
		events.push({ req: step.req, t: step.timeline.end, type: 'end' });
	}

	events.sort((left, right) =>
		left.t === right.t ? (left.type === 'end' ? -1 : 1) : left.t - right.t,
	);

	const currentUsage = Object.fromEntries(Array.from(resources).map((resource) => [resource, 0]));
	let previousTime: number | null = null;
	const intervals: Array<Omit<PlanConflict, 'culprits' | 'text'>> = [];

	for (const event of events) {
		if (previousTime !== null && previousTime < event.t) {
			for (const resource of resources) {
				const cap = Number.isFinite(capacity[resource]) ? capacity[resource] : 1;

				if (currentUsage[resource] > cap) {
					intervals.push({
						cap,
						end: event.t,
						res: resource,
						start: previousTime,
						usage: currentUsage[resource],
					});
				}
			}
		}

		for (const [resource, amount] of Object.entries(event.req ?? {})) {
			currentUsage[resource] =
				(currentUsage[resource] ?? 0) + (event.type === 'start' ? amount : -amount);
		}

		previousTime = event.t;
	}

	return intervals.map((interval) => {
		const culprits = steps
			.filter((step) => {
				const requirement = step.req?.[interval.res];

				if (!requirement) {
					return false;
				}

				return (
					Math.max(interval.start, step.timeline.start) < Math.min(interval.end, step.timeline.end)
				);
			})
			.map((step) => step.id);

		return {
			...interval,
			culprits,
			text: `${getResourceLabel(interval.res)} が ${interval.start}-${interval.end}分 の間 ${interval.usage}>${interval.cap}`,
		};
	});
};

const roundUp = (value: number, step: number): number => Math.ceil(value / step - 1e-9) * step;

const fitsCapacity = ({
	capacity,
	end,
	req,
	scheduled,
	start,
}: {
	capacity: PlanResourceCapacity;
	end: number;
	req: Record<string, number>;
	scheduled: ScheduledInterval[];
	start: number;
}): boolean => {
	const points = new Set<number>([start, end]);

	for (const interval of scheduled) {
		if (Math.max(start, interval.start) < Math.min(end, interval.end)) {
			points.add(interval.start);
			points.add(interval.end);
		}
	}

	const sortedPoints = Array.from(points).sort((left, right) => left - right);

	for (let index = 0; index < sortedPoints.length - 1; index += 1) {
		const midpoint = (sortedPoints[index] + sortedPoints[index + 1]) / 2;
		const usage: Record<string, number> = {};

		for (const interval of scheduled) {
			if (interval.start <= midpoint && midpoint < interval.end) {
				for (const [resource, amount] of Object.entries(interval.req)) {
					usage[resource] = (usage[resource] ?? 0) + amount;
				}
			}
		}

		for (const [resource, amount] of Object.entries(req)) {
			usage[resource] = (usage[resource] ?? 0) + amount;
		}

		for (const [resource, amount] of Object.entries(usage)) {
			const cap = Number.isFinite(capacity[resource]) ? capacity[resource] : 1;

			if (amount > cap) {
				return false;
			}
		}
	}

	return true;
};

export const scheduleGreedy = (
	inputSteps: PlanStep[],
	capacity: PlanResourceCapacity,
	options: { step?: number } = {},
): PlanStep[] => {
	const stepSize = options.step ?? 0.5;
	const steps = clonePlanSteps(inputSteps);
	const byId = new Map(steps.map((step) => [step.id, step]));
	const scheduled: ScheduledInterval[] = [];

	steps.sort(
		(left, right) =>
			left.timeline.start - right.timeline.start || left.label.localeCompare(right.label, 'ja'),
	);

	for (const step of steps) {
		const duration = getStepDuration(step);
		const slack = typeof step.slack === 'number' ? step.slack : 0;
		const dependencyReadyAt = step.after.length
			? Math.max(...step.after.map((dependencyId) => byId.get(dependencyId)?.timeline.end ?? 0))
			: 0;
		const earliest = Math.max(step.timeline.start, dependencyReadyAt);
		const latest = earliest + slack;
		let placed = false;

		for (
			let start = roundUp(earliest, stepSize);
			start <= latest + 1e-9;
			start = roundUp(start + stepSize, stepSize)
		) {
			const end = start + duration;

			if (
				fitsCapacity({
					capacity,
					end,
					req: step.req ?? {},
					scheduled,
					start,
				})
			) {
				step.timeline.start = start;
				step.timeline.end = end;
				scheduled.push({ end, id: step.id, req: step.req ?? {}, start });
				placed = true;
				break;
			}
		}

		if (!placed) {
			step.timeline.start = earliest;
			step.timeline.end = earliest + duration;
			scheduled.push({
				end: step.timeline.end,
				id: step.id,
				req: step.req ?? {},
				start: step.timeline.start,
			});
		}
	}

	return steps;
};

export const scheduleBackward = (
	inputSteps: PlanStep[],
	options: { targetEnd?: number } = {},
): PlanStep[] => {
	const steps = clonePlanSteps(inputSteps);
	const byId = new Map(steps.map((step) => [step.id, step]));
	const dependents = new Map<string, string[]>();

	for (const step of steps) {
		for (const dependencyId of step.after) {
			const current = dependents.get(dependencyId) ?? [];
			current.push(step.id);
			dependents.set(dependencyId, current);
		}
	}

	const indegree = new Map(steps.map((step) => [step.id, 0]));

	for (const step of steps) {
		for (const dependencyId of step.after) {
			if (byId.has(dependencyId)) {
				indegree.set(step.id, (indegree.get(step.id) ?? 0) + 1);
			}
		}
	}

	const queue = steps.filter((step) => (indegree.get(step.id) ?? 0) === 0).map((step) => step.id);
	const topoOrder: string[] = [];

	while (queue.length > 0) {
		const currentId = queue.shift();

		if (!currentId) {
			continue;
		}

		topoOrder.push(currentId);

		for (const dependentId of dependents.get(currentId) ?? []) {
			indegree.set(dependentId, (indegree.get(dependentId) ?? 0) - 1);

			if ((indegree.get(dependentId) ?? 0) === 0) {
				queue.push(dependentId);
			}
		}
	}

	for (const stepId of topoOrder.reverse()) {
		const step = byId.get(stepId);

		if (!step) {
			continue;
		}

		const duration = getStepDuration(step);
		const slack = typeof step.slack === 'number' ? step.slack : 0;
		let latestStart = step.timeline.start + slack;
		const dependentIds = dependents.get(stepId) ?? [];

		if (dependentIds.length > 0) {
			latestStart = Math.min(
				latestStart,
				...dependentIds.map(
					(dependentId) =>
						(byId.get(dependentId)?.timeline.start ?? Number.POSITIVE_INFINITY) - duration,
				),
			);
		} else if (Number.isFinite(options.targetEnd)) {
			latestStart = Math.min(latestStart, (options.targetEnd as number) - duration);
		}

		const earliestStart = step.after.length
			? Math.max(...step.after.map((dependencyId) => byId.get(dependencyId)?.timeline.end ?? 0))
			: 0;
		const nextStart = Math.max(earliestStart, latestStart);

		if (nextStart > step.timeline.start) {
			step.timeline.start = nextStart;
			step.timeline.end = nextStart + duration;
		}
	}

	return steps;
};

const severityOfConflicts = (conflicts: PlanConflict[]): number =>
	conflicts.reduce(
		(total, conflict) =>
			total +
			Math.max(0, conflict.usage - conflict.cap) * Math.max(0, conflict.end - conflict.start),
		0,
	);

const computePeakUsage = (steps: PlanStep[], resourceKey: string): number => {
	const points = new Set<number>();

	for (const step of steps) {
		points.add(step.timeline.start);
		points.add(step.timeline.end);
	}

	const sorted = Array.from(points).sort((left, right) => left - right);
	let peak = 0;

	for (let index = 0; index < sorted.length - 1; index += 1) {
		const midpoint = (sorted[index] + sorted[index + 1]) / 2;
		let usage = 0;

		for (const step of steps) {
			if (!step.req?.[resourceKey]) {
				continue;
			}

			if (step.timeline.start <= midpoint && midpoint < step.timeline.end) {
				usage += step.req[resourceKey];
			}
		}

		peak = Math.max(peak, usage);
	}

	return peak;
};

export const levelResources = (
	inputSteps: PlanStep[],
	capacity: PlanResourceCapacity,
	options: {
		maxIter?: number;
		objective?: 'min_conflicts' | 'min_peak_hands';
		pinnedIds?: string[];
		step?: number;
	} = {},
): PlanStep[] => {
	const stepSize = options.step ?? 0.5;
	const pinnedIds = new Set(options.pinnedIds ?? []);
	const steps = clonePlanSteps(inputSteps);
	const byId = new Map(steps.map((step) => [step.id, step]));
	const dependents = new Map<string, string[]>();

	for (const step of steps) {
		for (const dependencyId of step.after) {
			const current = dependents.get(dependencyId) ?? [];
			current.push(step.id);
			dependents.set(dependencyId, current);
		}
	}

	let best = clonePlanSteps(steps);
	let bestScore = severityOfConflicts(computeConflicts(best, capacity));
	let bestPeakHands = computePeakUsage(best, 'hands');

	for (let iteration = 0; iteration < (options.maxIter ?? 200); iteration += 1) {
		const conflicts = computeConflicts(steps, capacity);

		if (conflicts.length === 0) {
			break;
		}

		const targetConflict = [...conflicts].sort(
			(left, right) =>
				(right.usage - right.cap) * (right.end - right.start) -
				(left.usage - left.cap) * (left.end - left.start),
		)[0];

		if (!targetConflict) {
			break;
		}

		const candidates = (targetConflict.culprits ?? [])
			.map((stepId) => byId.get(stepId))
			.filter((step): step is PlanStep =>
				Boolean(
					step &&
					!pinnedIds.has(step.id) &&
					(step.slack ?? 0) > 0 &&
					(step.req?.[targetConflict.res] ?? 0) > 0,
				),
			)
			.sort((left, right) => (left.slack ?? 0) - (right.slack ?? 0));

		let improved = false;

		for (const candidate of candidates) {
			const duration = getStepDuration(candidate);
			const earliestAllowed = Math.max(
				candidate.timeline.start,
				...candidate.after.map((dependencyId) => byId.get(dependencyId)?.timeline.end ?? 0),
			);
			const dependentStarts = (dependents.get(candidate.id) ?? []).map(
				(stepId) => byId.get(stepId)?.timeline.start ?? Number.POSITIVE_INFINITY,
			);
			const latestAllowed = Math.min(
				candidate.timeline.start + (candidate.slack ?? 0),
				dependentStarts.length > 0
					? Math.min(...dependentStarts) - duration
					: Number.POSITIVE_INFINITY,
			);

			if (!(earliestAllowed <= latestAllowed)) {
				continue;
			}

			for (
				let start = Math.max(
					roundUp(candidate.timeline.start + stepSize, stepSize),
					earliestAllowed,
				);
				start <= latestAllowed + 1e-9;
				start = roundUp(start + stepSize, stepSize)
			) {
				const trial = clonePlanSteps(steps);
				const target = trial.find((step) => step.id === candidate.id);

				if (!target) {
					continue;
				}

				target.timeline.start = start;
				target.timeline.end = start + duration;

				const severity = severityOfConflicts(computeConflicts(trial, capacity));
				const peakHands = computePeakUsage(trial, 'hands');
				const isBetter =
					(options.objective ?? 'min_conflicts') === 'min_peak_hands'
						? peakHands < bestPeakHands || (peakHands <= bestPeakHands && severity < bestScore)
						: severity < bestScore;

				if (isBetter) {
					best = trial;
					bestPeakHands = peakHands;
					bestScore = severity;
					steps.splice(0, steps.length, ...clonePlanSteps(trial));
					for (const step of steps) {
						byId.set(step.id, step);
					}
					improved = true;
					break;
				}
			}

			if (improved) {
				break;
			}
		}

		if (!improved) {
			break;
		}
	}

	return best;
};

export const schedulePipeline = (
	inputSteps: PlanStep[],
	capacity: PlanResourceCapacity,
	options: {
		maxIter?: number;
		objective?: 'min_conflicts' | 'min_peak_hands';
		pinnedIds?: string[];
		step?: number;
		targetEnd?: number;
	} = {},
): PlanStep[] => {
	const backwardScheduled = Number.isFinite(options.targetEnd)
		? scheduleBackward(inputSteps, { targetEnd: options.targetEnd })
		: clonePlanSteps(inputSteps);
	const greedyScheduled = scheduleGreedy(backwardScheduled, capacity, { step: options.step });

	return levelResources(greedyScheduled, capacity, {
		maxIter: options.maxIter,
		objective: options.objective,
		pinnedIds: options.pinnedIds,
		step: options.step,
	});
};
