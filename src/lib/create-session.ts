import { and, asc, eq, sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { db } from '@/db';
import { planRecipeSources, plans, recipeSources } from '@/db/schema';
import { auth } from '@/lib/auth';
import type { RecipeProcessingStatus, RecipeSourceRawContent } from '@/lib/plans/types';
import { parseUuid } from '@/lib/uuid';

export type RecipeInputMode = 'url' | 'text';

export type CreateRecipeItem = {
	id: string;
	type: RecipeInputMode;
	label: string;
	title: string | null;
	summary: string | null;
	processingStatus: RecipeProcessingStatus;
	processingError: string | null;
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
			processingStatus: recipe.processingStatus,
			processingError: recipe.processingError,
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
			recipes.length > 0 && recipes.every((recipe) => recipe.processingStatus === 'completed'),
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
			processingStatus: recipeSources.processingStatus,
			processingError: recipeSources.processingError,
			createdAt: recipeSources.createdAt,
			updatedAt: recipeSources.updatedAt,
		});

	await db.execute(sql`
		WITH plan_lock AS (
			SELECT pg_advisory_xact_lock(hashtext(${validPlanId}))
		),
		next_sort_order AS (
			SELECT coalesce(max(${planRecipeSources.sortOrder}), -1) + 1 AS sort_order
			FROM ${planRecipeSources}
			WHERE ${planRecipeSources.planId} = ${validPlanId}
		)
		INSERT INTO ${planRecipeSources}
			(${planRecipeSources.planId}, ${planRecipeSources.recipeSourceId}, ${planRecipeSources.sortOrder})
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
		processingStatus: recipeSource.processingStatus,
		processingError: recipeSource.processingError,
		createdAt: recipeSource.createdAt.toISOString(),
		updatedAt: recipeSource.updatedAt.toISOString(),
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
