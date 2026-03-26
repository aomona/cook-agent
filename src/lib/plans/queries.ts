import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { planRecipeSources, plans, planVersions, recipeSources } from '@/db/schema';
import { planDocumentSchema } from '@/lib/plans/schema';
import type {
	NormalizedRecipe,
	PlanDocument,
	PlanGenerationInput,
	PlanGenerationOptions,
} from '@/lib/plans/types';
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

export type ActivePlanVersionData = {
	id: string;
	versionNumber: number;
	changeSummary: string | null;
	createdAt: string;
	plan: PlanDocument;
};

export type PlanRecipeSnapshot = {
	id: string;
	type: 'url' | 'text';
	label: string;
	title: string | null;
	summary: string | null;
	processingStatus: 'queued' | 'processing' | 'completed' | 'failed';
	normalizedRecipe: NormalizedRecipe | null;
};

export type PlanEditorData = {
	id: string;
	title: string;
	status: 'draft' | 'ready' | 'archived';
	requestedServings: number | null;
	recipes: PlanRecipeSnapshot[];
	activeVersion: ActivePlanVersionData | null;
};

const getRecipeLabel = ({
	sourceType,
	sourceUrl,
	rawContent,
}: {
	sourceType: 'url' | 'manual';
	sourceUrl: string | null;
	rawContent: { inputText?: string; title?: string };
}): string => {
	if (sourceType === 'url') {
		return sourceUrl ?? '';
	}

	return rawContent.inputText ?? rawContent.title ?? '貼り付けたレシピテキスト';
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

export const deleteOwnedPlan = async (planId: string, userId: string): Promise<boolean> => {
	const validPlanId = parseUuid(planId);

	if (!validPlanId) {
		return false;
	}

	const [deletedPlan] = await db
		.delete(plans)
		.where(and(eq(plans.id, validPlanId), eq(plans.userId, userId)))
		.returning({
			id: plans.id,
		});

	return Boolean(deletedPlan);
};

export const getOwnedPlanEditorData = async (
	planId: string,
	userId: string,
): Promise<PlanEditorData | null> => {
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
			activeVersionId: plans.activeVersionId,
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
			normalizedRecipe: recipeSources.normalizedRecipe,
			sortOrder: planRecipeSources.sortOrder,
		})
		.from(planRecipeSources)
		.innerJoin(recipeSources, eq(planRecipeSources.recipeSourceId, recipeSources.id))
		.where(and(eq(planRecipeSources.planId, validPlanId), eq(recipeSources.userId, userId)))
		.orderBy(asc(planRecipeSources.sortOrder), asc(recipeSources.createdAt));

	const recipes: PlanRecipeSnapshot[] = recipeRows.map((recipe) => ({
		id: recipe.id,
		type: recipe.sourceType === 'url' ? 'url' : 'text',
		label: getRecipeLabel({
			sourceType: recipe.sourceType,
			sourceUrl: recipe.sourceUrl,
			rawContent: recipe.rawContent,
		}),
		title: recipe.title,
		summary: recipe.summary,
		processingStatus: recipe.processingStatus,
		normalizedRecipe: recipe.normalizedRecipe,
	}));

	const [activeVersion] = plan.activeVersionId
		? await db
				.select({
					id: planVersions.id,
					versionNumber: planVersions.versionNumber,
					changeSummary: planVersions.changeSummary,
					createdAt: planVersions.createdAt,
					planJson: planVersions.planJson,
				})
				.from(planVersions)
				.where(and(eq(planVersions.id, plan.activeVersionId), eq(planVersions.planId, plan.id)))
		: [];

	const parsedActivePlan = activeVersion
		? planDocumentSchema.safeParse(activeVersion.planJson)
		: null;

	return {
		id: plan.id,
		title: plan.title,
		status: plan.status,
		requestedServings: plan.requestedServings,
		recipes,
		activeVersion:
			activeVersion && parsedActivePlan?.success
				? {
						id: activeVersion.id,
						versionNumber: activeVersion.versionNumber,
						changeSummary: activeVersion.changeSummary,
						createdAt: activeVersion.createdAt.toISOString(),
						plan: parsedActivePlan.data,
					}
				: null,
	};
};

export const buildPlanGenerationInput = async ({
	options,
	planId,
	userId,
}: {
	options: PlanGenerationOptions;
	planId: string;
	userId: string;
}): Promise<PlanGenerationInput> => {
	const plan = await getOwnedPlanEditorData(planId, userId);

	if (!plan) {
		throw new Error('Plan not found.');
	}

	if (plan.status === 'archived') {
		throw new Error('Archived plans cannot be generated.');
	}

	if (plan.recipes.length === 0) {
		throw new Error('At least one structured recipe is required.');
	}

	const incompleteRecipe = plan.recipes.find(
		(recipe) => recipe.processingStatus !== 'completed' || !recipe.normalizedRecipe,
	);

	if (incompleteRecipe) {
		throw new Error('All recipes must be processed before generating a plan.');
	}

	return {
		planId: plan.id,
		title: plan.title,
		requestedServings: options.requestedServings,
		availableEquipment: options.availableEquipment,
		constraints: options.constraints,
		recipes: plan.recipes.map((recipe) => ({
			recipeSourceId: recipe.id,
			sourceType: recipe.type === 'url' ? 'url' : 'manual',
			sourceUrl: recipe.type === 'url' ? recipe.label : null,
			title: recipe.title ?? recipe.label,
			summary: recipe.summary,
			normalizedRecipe: recipe.normalizedRecipe as NormalizedRecipe,
		})),
	};
};

export const saveGeneratedPlanVersion = async ({
	planDocument,
	planId,
	requestedServings,
	userId,
}: {
	planDocument: PlanDocument;
	planId: string;
	requestedServings: number;
	userId: string;
}): Promise<ActivePlanVersionData> => {
	const validPlanId = parseUuid(planId);

	if (!validPlanId) {
		throw new Error('Plan not found.');
	}

	const [plan] = await db
		.select({
			id: plans.id,
			activeVersionId: plans.activeVersionId,
		})
		.from(plans)
		.where(and(eq(plans.id, validPlanId), eq(plans.userId, userId)));

	if (!plan) {
		throw new Error('Plan not found.');
	}

	const [nextVersionNumber] = await db
		.select({
			value: sql<number>`coalesce(max(${planVersions.versionNumber}), 0) + 1`,
		})
		.from(planVersions)
		.where(eq(planVersions.planId, validPlanId));

	const [insertedVersion] = await db
		.insert(planVersions)
		.values({
			planId: validPlanId,
			versionNumber: Number(nextVersionNumber?.value ?? 1),
			parentVersionId: plan.activeVersionId,
			changeReason: plan.activeVersionId ? 'user_edit' : 'initial',
			changeSummary: plan.activeVersionId
				? 'AI が工程を再生成しました。'
				: 'AI が工程を生成しました。',
			planJson: planDocument,
			createdByUserId: userId,
		})
		.returning({
			id: planVersions.id,
			versionNumber: planVersions.versionNumber,
			changeSummary: planVersions.changeSummary,
			createdAt: planVersions.createdAt,
			planJson: planVersions.planJson,
		});

	await db
		.update(plans)
		.set({
			activeVersionId: insertedVersion.id,
			requestedServings,
			status: 'ready',
		})
		.where(and(eq(plans.id, validPlanId), eq(plans.userId, userId)));

	const parsedPlan = planDocumentSchema.parse(insertedVersion.planJson);

	return {
		id: insertedVersion.id,
		versionNumber: insertedVersion.versionNumber,
		changeSummary: insertedVersion.changeSummary,
		createdAt: insertedVersion.createdAt.toISOString(),
		plan: parsedPlan,
	};
};
