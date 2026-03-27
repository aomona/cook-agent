import { and, asc, eq, sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { db } from '@/db';
import { planRecipeSources, plans, recipeSources } from '@/db/schema';
import { auth } from '@/lib/auth';
import type {
	NormalizedRecipe,
	RecipeProcessingStatus,
	RecipeSourceRawContent,
} from '@/lib/plans/types';
import { parseUuid } from '@/lib/uuid';

export type RecipeInputMode = 'url' | 'text';

export type CreateRecipeItem = {
	id: string;
	type: RecipeInputMode;
	label: string;
	title: string | null;
	summary: string | null;
	normalizedRecipe: NormalizedRecipe | null;
	normalizedServings: number | null;
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

export const getRecipeInputMode = (sourceType: 'url' | 'manual'): RecipeInputMode =>
	sourceType === 'url' ? 'url' : 'text';

const getRequiresServingsInput = ({
	normalizedRecipe,
	processingStatus,
}: {
	normalizedRecipe: NormalizedRecipe | null;
	processingStatus: RecipeProcessingStatus;
}): boolean =>
	processingStatus === 'completed' && Boolean(normalizedRecipe && !normalizedRecipe.servings);

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
			sortOrder: planRecipeSources.sortOrder,
		})
		.from(planRecipeSources)
		.innerJoin(recipeSources, eq(planRecipeSources.recipeSourceId, recipeSources.id))
		.where(and(eq(planRecipeSources.planId, validPlanId), eq(recipeSources.userId, userId)))
		.orderBy(asc(planRecipeSources.sortOrder), asc(recipeSources.createdAt));

	const recipes = recipeRows.map(
		(recipe): CreateRecipeItem => ({
			id: recipe.id,
			type: getRecipeInputMode(recipe.sourceType),
			label: getRecipeLabel({
				sourceType: recipe.sourceType,
				sourceUrl: recipe.sourceUrl,
				rawContent: recipe.rawContent,
			}),
			title: recipe.title,
			summary: recipe.summary,
			normalizedRecipe: recipe.normalizedRecipe,
			normalizedServings: recipe.normalizedRecipe?.servings ?? null,
			processingStatus: recipe.processingStatus,
			processingError: recipe.processingError,
			requiresServingsInput: getRequiresServingsInput({
				normalizedRecipe: recipe.normalizedRecipe,
				processingStatus: recipe.processingStatus,
			}),
			createdAt: recipe.createdAt.toISOString(),
			updatedAt: recipe.updatedAt.toISOString(),
		}),
	);

	return {
		id: plan.id,
		title: plan.title,
		status: plan.status,
		requestedServings: plan.requestedServings,
		createdAt: plan.createdAt.toISOString(),
		updatedAt: plan.updatedAt.toISOString(),
		recipes,
		canProceed:
			recipes.length > 0 &&
			recipes.every(
				(recipe) => recipe.processingStatus === 'completed' && !recipe.requiresServingsInput,
			),
	};
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

	return {
		id: recipeSource.id,
		type: getRecipeInputMode(recipeSource.sourceType),
		label: getRecipeLabel({
			sourceType: recipeSource.sourceType,
			sourceUrl: recipeSource.sourceUrl,
			rawContent: recipeSource.rawContent,
		}),
		title: recipeSource.title,
		summary: recipeSource.summary,
		normalizedRecipe: recipeSource.normalizedRecipe,
		normalizedServings: recipeSource.normalizedRecipe?.servings ?? null,
		processingStatus: recipeSource.processingStatus,
		processingError: recipeSource.processingError,
		requiresServingsInput: getRequiresServingsInput({
			normalizedRecipe: recipeSource.normalizedRecipe,
			processingStatus: recipeSource.processingStatus,
		}),
		createdAt: recipeSource.createdAt.toISOString(),
		updatedAt: recipeSource.updatedAt.toISOString(),
	};
};

export const updateRecipeServingsForPlan = async ({
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

	const nextNormalizedRecipe: NormalizedRecipe = {
		...linkedRecipe.normalizedRecipe,
		servings,
	};

	const [updatedRecipe] = await db
		.update(recipeSources)
		.set({
			normalizedRecipe: nextNormalizedRecipe,
			servingsText: `${servings}人分`,
		})
		.where(and(eq(recipeSources.id, recipeSourceId), eq(recipeSources.userId, userId)))
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

	if (!updatedRecipe) {
		throw new Error('Recipe not found.');
	}

	return {
		id: updatedRecipe.id,
		type: getRecipeInputMode(updatedRecipe.sourceType),
		label: getRecipeLabel({
			sourceType: updatedRecipe.sourceType,
			sourceUrl: updatedRecipe.sourceUrl,
			rawContent: updatedRecipe.rawContent,
		}),
		title: updatedRecipe.title,
		summary: updatedRecipe.summary,
		normalizedRecipe: updatedRecipe.normalizedRecipe,
		normalizedServings: updatedRecipe.normalizedRecipe?.servings ?? null,
		processingStatus: updatedRecipe.processingStatus,
		processingError: updatedRecipe.processingError,
		requiresServingsInput: getRequiresServingsInput({
			normalizedRecipe: updatedRecipe.normalizedRecipe,
			processingStatus: updatedRecipe.processingStatus,
		}),
		createdAt: updatedRecipe.createdAt.toISOString(),
		updatedAt: updatedRecipe.updatedAt.toISOString(),
	};
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
