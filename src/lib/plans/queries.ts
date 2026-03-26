import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { planRecipeSources, plans, recipeSources } from '@/db/schema';
import { parseUuid } from '@/lib/uuid';

export type PlanListItem = {
	id: string;
	title: string;
	status: 'draft' | 'ready' | 'archived';
	requestedServings: number | null;
	recipeCount: number;
	completedRecipeCount: number;
	createdAt: string;
	updatedAt: string;
};

export const getPlanListItems = async (userId: string): Promise<PlanListItem[]> => {
	const rows = await db
		.select({
			id: plans.id,
			title: plans.title,
			status: plans.status,
			requestedServings: plans.requestedServings,
			recipeCount: sql<number>`count(${planRecipeSources.recipeSourceId})`,
			completedRecipeCount: sql<number>`count(case when ${recipeSources.processingStatus} = 'completed' then 1 end)`,
			createdAt: plans.createdAt,
			updatedAt: plans.updatedAt,
		})
		.from(plans)
		.leftJoin(planRecipeSources, eq(plans.id, planRecipeSources.planId))
		.leftJoin(recipeSources, eq(planRecipeSources.recipeSourceId, recipeSources.id))
		.where(eq(plans.userId, userId))
		.groupBy(
			plans.id,
			plans.title,
			plans.status,
			plans.requestedServings,
			plans.createdAt,
			plans.updatedAt,
		)
		.orderBy(desc(plans.updatedAt));

	return rows.map((row) => ({
		id: row.id,
		title: row.title,
		status: row.status,
		requestedServings: row.requestedServings,
		recipeCount: Number(row.recipeCount),
		completedRecipeCount: Number(row.completedRecipeCount),
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	}));
};

export const getOwnedDraftPlan = async (
	planId: string,
	userId: string,
): Promise<{ id: string } | null> => {
	const validPlanId = parseUuid(planId);

	if (!validPlanId) {
		return null;
	}

	const [plan] = await db
		.select({
			id: plans.id,
		})
		.from(plans)
		.where(and(eq(plans.id, validPlanId), eq(plans.userId, userId), eq(plans.status, 'draft')));

	return plan ?? null;
};
