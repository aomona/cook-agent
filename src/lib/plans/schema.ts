import { z } from 'zod';
import type {
	PlanDocument,
	PlanGenerationOptions,
	PlanMaterial,
	PlanMetadata,
	PlanStep,
	PlanStepKind,
	PlanStepResourceRequirements,
	PlanStepTimeline,
	PlanTimer,
} from '@/lib/plans/types';

const nullableOptional = <TSchema extends z.ZodType>(schema: TSchema) =>
	z.preprocess((value) => (value === null ? undefined : value), schema.optional());

const planStepKindValues = ['prep', 'cook', 'finish', 'wait', 'cleanup'] as const;

const planResourceRequirementsSchema = z
	.record(z.string().trim().min(1).max(40), z.number().int().positive().max(8))
	.refine((value) => Object.keys(value).length <= 10, {
		message: 'req can include at most 10 resource keys.',
	}) satisfies z.ZodType<PlanStepResourceRequirements>;

const planStepTimelineSchema = z
	.object({
		start: z
			.number()
			.nonnegative()
			.max(24 * 60),
		end: z
			.number()
			.positive()
			.max(24 * 60),
	})
	.refine((value) => value.end > value.start, {
		message: 'timeline.end must be greater than timeline.start.',
	}) satisfies z.ZodType<PlanStepTimeline>;

export const planTimerSchema = z.object({
	id: z.string().trim().min(1).max(100),
	label: z.string().trim().min(1).max(120),
	seconds: z
		.number()
		.int()
		.positive()
		.max(60 * 60 * 12),
	autoStart: nullableOptional(z.boolean()),
}) satisfies z.ZodType<PlanTimer>;

export const planMaterialSchema = z.object({
	id: z.string().trim().min(1).max(120),
	name: z.string().trim().min(1).max(160),
	amount: nullableOptional(z.string().trim().min(1).max(120)),
	amountValue: nullableOptional(z.number().positive().max(100000)),
	amountMin: nullableOptional(z.number().positive().max(100000)),
	amountMax: nullableOptional(z.number().positive().max(100000)),
	unit: nullableOptional(z.string().trim().min(1).max(40)),
	recipeSourceId: nullableOptional(z.uuid()),
	sourceIngredientId: nullableOptional(z.string().trim().min(1).max(120)),
}) satisfies z.ZodType<PlanMaterial>;

export const planMetadataSchema = z.object({
	availableEquipment: z.array(z.string().trim().min(1).max(80)).max(30),
	constraints: z.array(z.string().trim().min(1).max(160)).max(30),
	recipeSourceIds: z.array(z.uuid()).max(20),
}) satisfies z.ZodType<PlanMetadata>;

export const planStepSchema = z
	.object({
		id: z.string().trim().min(1).max(120),
		label: z.string().trim().min(1).max(160),
		instructions: z.string().trim().min(1).max(1000),
		timeline: planStepTimelineSchema,
		time: z
			.number()
			.positive()
			.max(24 * 60),
		after: z.array(z.string().trim().min(1).max(120)).max(30),
		kind: z.enum(planStepKindValues) satisfies z.ZodType<PlanStepKind>,
		recipeSourceId: nullableOptional(z.uuid()),
		req: nullableOptional(planResourceRequirementsSchema),
		uses: nullableOptional(z.array(z.string().trim().min(1).max(120)).max(40)),
		slack: nullableOptional(
			z
				.number()
				.nonnegative()
				.max(24 * 60),
		),
		notesForUser: nullableOptional(z.array(z.string().trim().min(1).max(200)).max(10)),
		recoveryTips: nullableOptional(z.array(z.string().trim().min(1).max(200)).max(10)),
		outputs: nullableOptional(z.array(z.string().trim().min(1).max(120)).max(10)),
		timers: nullableOptional(z.array(planTimerSchema).max(5)),
		tags: nullableOptional(z.array(z.string().trim().min(1).max(40)).max(10)),
	})
	.superRefine((value, context) => {
		const expectedTime = value.timeline.end - value.timeline.start;

		if (Math.abs(value.time - expectedTime) > 0.001) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'time must match timeline.end - timeline.start.',
				path: ['time'],
			});
		}

		if (value.after.includes(value.id)) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'after cannot include the same step id.',
				path: ['after'],
			});
		}
	}) satisfies z.ZodType<PlanStep>;

export const planDocumentSchema = z.object({
	version: z.literal(2),
	title: z.string().trim().min(1).max(160),
	servings: z.number().int().positive().max(100),
	materials: z.array(planMaterialSchema).max(200),
	steps: z.array(planStepSchema).min(1).max(80),
	metadata: nullableOptional(planMetadataSchema),
}) satisfies z.ZodType<PlanDocument>;

export const planGenerationOptionsSchema = z.object({
	requestedServings: z.number().int().min(1).max(24),
	availableEquipment: z.array(z.string().trim().min(1).max(80)).max(30),
	constraints: z.array(z.string().trim().min(1).max(160)).max(30),
}) satisfies z.ZodType<PlanGenerationOptions>;
