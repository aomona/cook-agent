import { z } from 'zod';
import type {
	PlanDocument,
	PlanGenerationOptions,
	PlanStep,
	PlanStepIngredientRef,
	PlanTimer,
} from '@/lib/plans/types';

const nullableOptional = <TSchema extends z.ZodTypeAny>(schema: TSchema) =>
	z.preprocess((value) => (value === null ? undefined : value), schema.optional());

export const planTimerSchema: z.ZodType<PlanTimer> = z.object({
	id: z.string().trim().min(1).max(100),
	label: z.string().trim().min(1).max(120),
	seconds: z
		.number()
		.int()
		.positive()
		.max(60 * 60 * 12),
	autoStart: nullableOptional(z.boolean()),
});

export const planStepIngredientRefSchema: z.ZodType<PlanStepIngredientRef> = z.object({
	ingredientId: z.string().trim().min(1).max(120),
	preparation: nullableOptional(z.string().trim().min(1).max(120)),
	quantity: nullableOptional(z.string().trim().min(1).max(120)),
});

export const planStepSchema: z.ZodType<PlanStep> = z.object({
	id: z.string().trim().min(1).max(100),
	title: z.string().trim().min(1).max(120),
	description: z.string().trim().min(1).max(600),
	dependencies: z.array(z.string().trim().min(1).max(100)).max(20),
	estimatedMinutes: z
		.number()
		.int()
		.positive()
		.max(24 * 60),
	canParallelize: z.boolean(),
	recipeSourceId: nullableOptional(z.string().uuid()),
	notesForUser: nullableOptional(z.array(z.string().trim().min(1).max(200)).max(10)),
	recoveryTips: nullableOptional(z.array(z.string().trim().min(1).max(200)).max(10)),
	ingredients: nullableOptional(z.array(planStepIngredientRefSchema).max(20)),
	outputs: nullableOptional(z.array(z.string().trim().min(1).max(120)).max(10)),
	timers: nullableOptional(z.array(planTimerSchema).max(5)),
	tags: nullableOptional(z.array(z.string().trim().min(1).max(40)).max(10)),
});

export const planDocumentSchema: z.ZodType<PlanDocument> = z.object({
	version: z.literal(1),
	title: z.string().trim().min(1).max(160),
	servings: z.number().int().positive().max(100),
	steps: z.array(planStepSchema).min(1).max(60),
	metadata: nullableOptional(z.record(z.string(), z.unknown())),
});

export const planGenerationOptionsSchema: z.ZodType<PlanGenerationOptions> = z.object({
	requestedServings: z.number().int().min(1).max(24),
	availableEquipment: z.array(z.string().trim().min(1).max(80)).max(30),
	constraints: z.array(z.string().trim().min(1).max(160)).max(30),
});
