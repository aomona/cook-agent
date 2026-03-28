import { and, asc, eq, sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { db } from '@/db';
import { planRecipeSources, plans, recipeSources } from '@/db/schema';
import { auth } from '@/lib/auth';
import {
	normalizedRecipeSchema,
	recipeMaterialChangeSchema,
	recipeStepChangeSchema,
} from '@/lib/plans/schema';
import type {
	NormalizedRecipe,
	RecipeAdjustmentStatus,
	RecipeMaterialChange,
	RecipeProcessingStatus,
	RecipeSourceRawContent,
	RecipeStepChange,
} from '@/lib/plans/types';
import { parseUuid } from '@/lib/uuid';

export type RecipeInputMode = 'url' | 'text';

export type CreateRecipeItem = {
	id: string;
	type: RecipeInputMode;
	label: string;
	sourceValue: string;
	title: string | null;
	summary: string | null;
	normalizedRecipe: NormalizedRecipe | null;
	adjustedRecipe: NormalizedRecipe | null;
	baseServings: number | null;
	adjustedForServings: number | null;
	materialChanges: RecipeMaterialChange[];
	stepChanges: RecipeStepChange[];
	adjustmentStatus: RecipeAdjustmentStatus;
	adjustmentAttemptCount: number;
	adjustmentError: string | null;
	adjustmentConfirmedAt: string | null;
	processingStatus: RecipeProcessingStatus;
	processingError: string | null;
	requiresServingsInput: boolean;
	createdAt: string;
	updatedAt: string;
};

export type CreatePlanData = {
	id: string;
	title: string;
	status: 'draft' | 'ready' | 'archived';
	requestedServings: number | null;
	createdAt: string;
	updatedAt: string;
	recipes: CreateRecipeItem[];
	canProceed: boolean;
};

export const activeCreatePlanCookieName = 'cook-agent-active-create-plan-id';

type CookieReader = {
	get(name: string): { value: string } | undefined;
};

const clearAdjustedRecipeState: {
	adjustedAt: null;
	adjustedForServings: null;
	adjustedRecipe: null;
	adjustmentAttemptCount: number;
	adjustmentConfirmedAt: null;
	adjustmentError: null;
	materialChanges: RecipeMaterialChange[];
	stepChanges: RecipeStepChange[];
} = {
	adjustedAt: null,
	adjustedForServings: null,
	adjustedRecipe: null,
	adjustmentAttemptCount: 0,
	adjustmentConfirmedAt: null,
	adjustmentError: null,
	materialChanges: [],
	stepChanges: [],
};

export const getRecipeInputMode = (sourceType: 'url' | 'manual'): RecipeInputMode =>
	sourceType === 'url' ? 'url' : 'text';

const parseNormalizedRecipe = (value: unknown): NormalizedRecipe | null => {
	const parsedRecipe = normalizedRecipeSchema.safeParse(value);

	return parsedRecipe.success ? parsedRecipe.data : null;
};

const parseStepChanges = (value: unknown): RecipeStepChange[] => {
	const parsedStepChanges = recipeStepChangeSchema.array().safeParse(value ?? []);

	return parsedStepChanges.success ? parsedStepChanges.data : [];
};

const parseMaterialChanges = (value: unknown): RecipeMaterialChange[] => {
	const parsedMaterialChanges = recipeMaterialChangeSchema.array().safeParse(value ?? []);

	return parsedMaterialChanges.success ? parsedMaterialChanges.data : [];
};

const getBaseServings = ({
	baseServingsOverride,
	normalizedRecipe,
}: {
	baseServingsOverride: number | null;
	normalizedRecipe: NormalizedRecipe | null;
}): number | null => baseServingsOverride ?? normalizedRecipe?.servings ?? null;

const getRequiresServingsInput = ({
	baseServingsOverride,
	normalizedRecipe,
	processingStatus,
}: {
	baseServingsOverride: number | null;
	normalizedRecipe: NormalizedRecipe | null;
	processingStatus: RecipeProcessingStatus;
}): boolean =>
	processingStatus === 'completed' && !getBaseServings({ baseServingsOverride, normalizedRecipe });

const getCanProceed = ({
	recipes,
	requestedServings,
}: {
	recipes: CreateRecipeItem[];
	requestedServings: number | null;
}): boolean =>
	requestedServings !== null &&
	recipes.length > 0 &&
	recipes.every(
		(recipe) =>
			recipe.processingStatus === 'completed' &&
			recipe.adjustmentStatus === 'completed' &&
			Boolean(recipe.adjustmentConfirmedAt) &&
			!recipe.requiresServingsInput &&
			Boolean(recipe.adjustedRecipe),
	);

const getRecipeLabel = ({
	sourceType,
	sourceUrl,
	rawContent,
}: {
	sourceType: 'url' | 'manual';
	sourceUrl: string | null;
	rawContent: RecipeSourceRawContent;
}): string => {
	if (sourceType === 'url') {
		return sourceUrl ?? '';
	}

	return rawContent.inputText ?? rawContent.title ?? '貼り付けたレシピテキスト';
};

const getRecipeSourceValue = ({
	rawContent,
	sourceType,
	sourceUrl,
}: {
	rawContent: RecipeSourceRawContent;
	sourceType: 'url' | 'manual';
	sourceUrl: string | null;
}): string => (sourceType === 'url' ? (sourceUrl ?? '') : (rawContent.inputText ?? ''));

const mapCreateRecipeItem = ({
	adjustedForServings,
	adjustedRecipe,
	adjustmentAttemptCount,
	adjustmentConfirmedAt,
	adjustmentError,
	adjustmentStatus,
	baseServingsOverride,
	createdAt,
	id,
	materialChanges,
	normalizedRecipe,
	processingError,
	processingStatus,
	rawContent,
	sourceType,
	sourceUrl,
	stepChanges,
	summary,
	title,
	updatedAt,
}: {
	adjustedForServings: number | null;
	adjustedRecipe: unknown;
	adjustmentAttemptCount: number;
	adjustmentConfirmedAt: Date | null;
	adjustmentError: string | null;
	adjustmentStatus: RecipeAdjustmentStatus;
	baseServingsOverride: number | null;
	createdAt: Date;
	id: string;
	materialChanges: unknown;
	normalizedRecipe: unknown;
	processingError: string | null;
	processingStatus: RecipeProcessingStatus;
	rawContent: RecipeSourceRawContent;
	sourceType: 'url' | 'manual';
	sourceUrl: string | null;
	stepChanges: unknown;
	summary: string | null;
	title: string | null;
	updatedAt: Date;
}): CreateRecipeItem => {
	const parsedNormalizedRecipe = parseNormalizedRecipe(normalizedRecipe);
	const parsedAdjustedRecipe = parseNormalizedRecipe(adjustedRecipe);
	const baseServings = getBaseServings({
		baseServingsOverride,
		normalizedRecipe: parsedNormalizedRecipe,
	});

	return {
		id,
		type: getRecipeInputMode(sourceType),
		label: getRecipeLabel({
			sourceType,
			sourceUrl,
			rawContent,
		}),
		sourceValue: getRecipeSourceValue({
			sourceType,
			sourceUrl,
			rawContent,
		}),
		title,
		summary,
		normalizedRecipe: parsedNormalizedRecipe,
		adjustedRecipe: parsedAdjustedRecipe,
		baseServings,
		adjustedForServings,
		materialChanges: parseMaterialChanges(materialChanges),
		stepChanges: parseStepChanges(stepChanges),
		adjustmentStatus,
		adjustmentAttemptCount,
		adjustmentError,
		adjustmentConfirmedAt: adjustmentConfirmedAt?.toISOString() ?? null,
		processingStatus,
		processingError,
		requiresServingsInput: getRequiresServingsInput({
			baseServingsOverride,
			normalizedRecipe: parsedNormalizedRecipe,
			processingStatus,
		}),
		createdAt: createdAt.toISOString(),
		updatedAt: updatedAt.toISOString(),
	};
};

export const getAuthenticatedUserId = async (): Promise<string | null> => {
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	return session?.user.id ?? null;
};

export const getRequestActor = async (
	_cookieStore: CookieReader,
): Promise<{ userId: string } | null> => {
	const authenticatedUserId = await getAuthenticatedUserId();

	if (!authenticatedUserId) {
		return null;
	}

	return {
		userId: authenticatedUserId,
	};
};

export const getActiveCreatePlanId = (cookieStore: CookieReader): string | null =>
	cookieStore.get(activeCreatePlanCookieName)?.value ?? null;

export const createDraftPlan = async (userId: string): Promise<{ id: string }> => {
	const [plan] = await db
		.insert(plans)
		.values({
			userId,
			title: '新しい献立',
			status: 'draft',
		})
		.returning({
			id: plans.id,
		});

	return plan;
};

export const getCreatePlanData = async (
	planId: string,
	userId: string,
): Promise<CreatePlanData | null> => {
	const validPlanId = parseUuid(planId);

	if (!validPlanId) {
		return null;
	}

	const [plan] = await db
		.select({
			id: plans.id,
			title: plans.title,
			status: plans.status,
			requestedServings: plans.requestedServings,
			createdAt: plans.createdAt,
			updatedAt: plans.updatedAt,
		})
		.from(plans)
		.where(and(eq(plans.id, validPlanId), eq(plans.userId, userId)));

	if (!plan) {
		return null;
	}

	const recipeRows = await db
		.select({
			adjustedForServings: planRecipeSources.adjustedForServings,
			adjustedRecipe: planRecipeSources.adjustedRecipe,
			adjustmentAttemptCount: planRecipeSources.adjustmentAttemptCount,
			adjustmentConfirmedAt: planRecipeSources.adjustmentConfirmedAt,
			adjustmentError: planRecipeSources.adjustmentError,
			adjustmentStatus: planRecipeSources.adjustmentStatus,
			baseServingsOverride: planRecipeSources.baseServingsOverride,
			id: recipeSources.id,
			materialChanges: planRecipeSources.materialChanges,
			sourceType: recipeSources.sourceType,
			sourceUrl: recipeSources.sourceUrl,
			rawContent: recipeSources.rawContent,
			stepChanges: planRecipeSources.stepChanges,
			title: recipeSources.title,
			summary: recipeSources.summary,
			normalizedRecipe: recipeSources.normalizedRecipe,
			processingStatus: recipeSources.processingStatus,
			processingError: recipeSources.processingError,
			createdAt: recipeSources.createdAt,
			updatedAt: recipeSources.updatedAt,
			sortOrder: planRecipeSources.sortOrder,
		})
		.from(planRecipeSources)
		.innerJoin(recipeSources, eq(planRecipeSources.recipeSourceId, recipeSources.id))
		.where(and(eq(planRecipeSources.planId, validPlanId), eq(recipeSources.userId, userId)))
		.orderBy(asc(planRecipeSources.sortOrder), asc(recipeSources.createdAt));

	const recipes = recipeRows.map((recipe): CreateRecipeItem => mapCreateRecipeItem(recipe));

	return {
		id: plan.id,
		title: plan.title,
		status: plan.status,
		requestedServings: plan.requestedServings,
		createdAt: plan.createdAt.toISOString(),
		updatedAt: plan.updatedAt.toISOString(),
		recipes,
		canProceed: getCanProceed({ recipes, requestedServings: plan.requestedServings }),
	};
};

const getLinkedCreateRecipeItem = async ({
	planId,
	recipeSourceId,
	userId,
}: {
	planId: string;
	recipeSourceId: string;
	userId: string;
}): Promise<CreateRecipeItem | null> => {
	const [linkedRecipe] = await db
		.select({
			adjustedForServings: planRecipeSources.adjustedForServings,
			adjustedRecipe: planRecipeSources.adjustedRecipe,
			adjustmentAttemptCount: planRecipeSources.adjustmentAttemptCount,
			adjustmentConfirmedAt: planRecipeSources.adjustmentConfirmedAt,
			adjustmentError: planRecipeSources.adjustmentError,
			adjustmentStatus: planRecipeSources.adjustmentStatus,
			baseServingsOverride: planRecipeSources.baseServingsOverride,
			createdAt: recipeSources.createdAt,
			id: recipeSources.id,
			materialChanges: planRecipeSources.materialChanges,
			normalizedRecipe: recipeSources.normalizedRecipe,
			processingError: recipeSources.processingError,
			processingStatus: recipeSources.processingStatus,
			rawContent: recipeSources.rawContent,
			sourceType: recipeSources.sourceType,
			sourceUrl: recipeSources.sourceUrl,
			stepChanges: planRecipeSources.stepChanges,
			summary: recipeSources.summary,
			title: recipeSources.title,
			updatedAt: recipeSources.updatedAt,
		})
		.from(planRecipeSources)
		.innerJoin(recipeSources, eq(planRecipeSources.recipeSourceId, recipeSources.id))
		.where(
			and(
				eq(planRecipeSources.planId, planId),
				eq(planRecipeSources.recipeSourceId, recipeSourceId),
				eq(recipeSources.userId, userId),
			),
		);

	return linkedRecipe ? mapCreateRecipeItem(linkedRecipe) : null;
};

export const createRecipeSourceForPlan = async ({
	planId,
	userId,
	type,
	value,
}: {
	planId: string;
	userId: string;
	type: RecipeInputMode;
	value: string;
}): Promise<CreateRecipeItem> => {
	const validPlanId = parseUuid(planId);

	if (!validPlanId) {
		throw new Error('Plan not found.');
	}

	const [plan] = await db
		.select({
			id: plans.id,
			status: plans.status,
		})
		.from(plans)
		.where(and(eq(plans.id, validPlanId), eq(plans.userId, userId)));

	if (!plan || plan.status !== 'draft') {
		throw new Error('Plan not found.');
	}

	const sourceType = type === 'url' ? 'url' : 'manual';
	const rawContent: RecipeSourceRawContent =
		type === 'text'
			? {
					inputText: value,
				}
			: {};

	const [recipeSource] = await db
		.insert(recipeSources)
		.values({
			userId,
			sourceType,
			sourceUrl: type === 'url' ? value : null,
			rawContent,
			processingStatus: 'queued',
		})
		.returning({
			id: recipeSources.id,
			sourceType: recipeSources.sourceType,
			sourceUrl: recipeSources.sourceUrl,
			rawContent: recipeSources.rawContent,
			title: recipeSources.title,
			summary: recipeSources.summary,
			normalizedRecipe: recipeSources.normalizedRecipe,
			processingStatus: recipeSources.processingStatus,
			processingError: recipeSources.processingError,
			createdAt: recipeSources.createdAt,
			updatedAt: recipeSources.updatedAt,
		});

	await db.execute(sql`
		WITH plan_lock AS (
			SELECT pg_advisory_xact_lock(hashtext(${validPlanId})) AS locked
		),
		next_sort_order AS (
			SELECT coalesce(max(${planRecipeSources.sortOrder}), -1) + 1 AS sort_order
			FROM ${planRecipeSources}, plan_lock
			WHERE ${planRecipeSources.planId} = ${validPlanId}
		)
		INSERT INTO "plan_recipe_sources" ("plan_id", "recipe_source_id", "sort_order")
		SELECT ${validPlanId}, ${recipeSource.id}, next_sort_order.sort_order
		FROM next_sort_order
	`);

	const linkedRecipe = await getLinkedCreateRecipeItem({
		planId: validPlanId,
		recipeSourceId: recipeSource.id,
		userId,
	});

	if (!linkedRecipe) {
		throw new Error('Recipe not found.');
	}

	return linkedRecipe;
};

export const updateRecipeBaseServingsForPlan = async ({
	planId,
	recipeSourceId,
	servings,
	userId,
}: {
	planId: string;
	recipeSourceId: string;
	servings: number;
	userId: string;
}): Promise<CreateRecipeItem> => {
	const [plan] = await db
		.select({
			id: plans.id,
			status: plans.status,
		})
		.from(plans)
		.where(and(eq(plans.id, planId), eq(plans.userId, userId)));

	if (!plan || plan.status !== 'draft') {
		throw new Error('Plan not found.');
	}

	const [linkedRecipe] = await db
		.select({
			normalizedRecipe: recipeSources.normalizedRecipe,
		})
		.from(planRecipeSources)
		.innerJoin(recipeSources, eq(planRecipeSources.recipeSourceId, recipeSources.id))
		.where(
			and(
				eq(planRecipeSources.planId, planId),
				eq(planRecipeSources.recipeSourceId, recipeSourceId),
				eq(recipeSources.userId, userId),
			),
		);

	if (!linkedRecipe || !linkedRecipe.normalizedRecipe) {
		throw new Error('Recipe not found.');
	}

	await db
		.update(planRecipeSources)
		.set({
			...clearAdjustedRecipeState,
			adjustmentStatus: 'idle',
			baseServingsOverride: servings,
		})
		.where(
			and(
				eq(planRecipeSources.planId, planId),
				eq(planRecipeSources.recipeSourceId, recipeSourceId),
			),
		);

	const updatedRecipe = await getLinkedCreateRecipeItem({
		planId,
		recipeSourceId,
		userId,
	});

	if (!updatedRecipe) {
		throw new Error('Recipe not found.');
	}

	return updatedRecipe;
};

export const updateRequestedServingsForPlan = async ({
	planId,
	requestedServings,
	userId,
}: {
	planId: string;
	requestedServings: number;
	userId: string;
}): Promise<void> => {
	const [plan] = await db
		.select({
			id: plans.id,
			status: plans.status,
		})
		.from(plans)
		.where(and(eq(plans.id, planId), eq(plans.userId, userId)));

	if (!plan || plan.status !== 'draft') {
		throw new Error('Plan not found.');
	}

	await db
		.update(plans)
		.set({
			requestedServings,
		})
		.where(and(eq(plans.id, planId), eq(plans.userId, userId)));

	await db
		.update(planRecipeSources)
		.set({
			...clearAdjustedRecipeState,
			adjustmentStatus: 'idle',
		})
		.where(eq(planRecipeSources.planId, planId));
};

export const retryRecipeAdjustmentForPlan = async ({
	planId,
	recipeSourceId,
	userId,
}: {
	planId: string;
	recipeSourceId: string;
	userId: string;
}): Promise<void> => {
	const updatedRecipe = await getLinkedCreateRecipeItem({
		planId,
		recipeSourceId,
		userId,
	});

	if (!updatedRecipe) {
		throw new Error('Recipe not found.');
	}

	await db
		.update(planRecipeSources)
		.set({
			...clearAdjustedRecipeState,
			adjustmentStatus: 'idle',
		})
		.where(
			and(
				eq(planRecipeSources.planId, planId),
				eq(planRecipeSources.recipeSourceId, recipeSourceId),
			),
		);
};

export const updateRecipeSourceInputForPlan = async ({
	mode,
	planId,
	recipeSourceId,
	userId,
	value,
}: {
	mode: RecipeInputMode;
	planId: string;
	recipeSourceId: string;
	userId: string;
	value: string;
}): Promise<CreateRecipeItem> => {
	const [plan] = await db
		.select({
			id: plans.id,
			status: plans.status,
		})
		.from(plans)
		.where(and(eq(plans.id, planId), eq(plans.userId, userId)));

	if (!plan || plan.status !== 'draft') {
		throw new Error('Plan not found.');
	}

	const [linkedRecipe] = await db
		.select({
			id: recipeSources.id,
		})
		.from(planRecipeSources)
		.innerJoin(recipeSources, eq(planRecipeSources.recipeSourceId, recipeSources.id))
		.where(
			and(
				eq(planRecipeSources.planId, planId),
				eq(planRecipeSources.recipeSourceId, recipeSourceId),
				eq(recipeSources.userId, userId),
			),
		);

	if (!linkedRecipe) {
		throw new Error('Recipe not found.');
	}

	const sourceType = mode === 'url' ? 'url' : 'manual';
	const rawContent: RecipeSourceRawContent =
		mode === 'text'
			? {
					inputText: value,
				}
			: {};

	await db
		.update(recipeSources)
		.set({
			description: null,
			fetchedAt: null,
			normalizedRecipe: null,
			processingError: null,
			processingStatus: 'queued',
			rawContent,
			sourceType,
			sourceUrl: mode === 'url' ? value : null,
			servingsText: null,
			summary: null,
			title: null,
		})
		.where(and(eq(recipeSources.id, recipeSourceId), eq(recipeSources.userId, userId)));

	await db
		.update(planRecipeSources)
		.set({
			...clearAdjustedRecipeState,
			adjustmentStatus: 'idle',
			baseServingsOverride: null,
		})
		.where(
			and(
				eq(planRecipeSources.planId, planId),
				eq(planRecipeSources.recipeSourceId, recipeSourceId),
			),
		);

	const updatedRecipe = await getLinkedCreateRecipeItem({
		planId,
		recipeSourceId,
		userId,
	});

	if (!updatedRecipe) {
		throw new Error('Recipe not found.');
	}

	return updatedRecipe;
};

export const deleteRecipeSourceFromPlan = async ({
	planId,
	recipeSourceId,
	userId,
}: {
	planId: string;
	recipeSourceId: string;
	userId: string;
}): Promise<void> => {
	const [plan] = await db
		.select({
			id: plans.id,
			status: plans.status,
		})
		.from(plans)
		.where(and(eq(plans.id, planId), eq(plans.userId, userId)));

	if (!plan || plan.status !== 'draft') {
		throw new Error('Plan not found.');
	}

	const [linkedRecipe] = await db
		.select({
			id: recipeSources.id,
		})
		.from(planRecipeSources)
		.innerJoin(recipeSources, eq(planRecipeSources.recipeSourceId, recipeSources.id))
		.where(
			and(
				eq(planRecipeSources.planId, planId),
				eq(planRecipeSources.recipeSourceId, recipeSourceId),
				eq(recipeSources.userId, userId),
			),
		);

	if (!linkedRecipe) {
		throw new Error('Recipe not found.');
	}

	await db.execute(sql`
		WITH recipe_lock AS (
			SELECT pg_advisory_xact_lock(hashtext(${recipeSourceId}))
		),
		deleted_link AS (
			DELETE FROM ${planRecipeSources}
			WHERE ${planRecipeSources.planId} = ${planId}
				AND ${planRecipeSources.recipeSourceId} = ${recipeSourceId}
			RETURNING ${planRecipeSources.recipeSourceId}
		)
		DELETE FROM ${recipeSources}
		WHERE ${recipeSources.id} = ${recipeSourceId}
			AND EXISTS (SELECT 1 FROM deleted_link)
			AND NOT EXISTS (
				SELECT 1
				FROM ${planRecipeSources}
				WHERE ${planRecipeSources.recipeSourceId} = ${recipeSourceId}
			)
	`);
};
