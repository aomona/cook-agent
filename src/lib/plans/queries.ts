import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { planRecipeSources, plans, planVersions, recipeSources } from '@/db/schema';
import { mergePlannerContext } from '@/lib/planning-settings';
import { getUserPlanningSettingsState } from '@/lib/planning-settings-queries';
import { scalePlanMaterial } from '@/lib/plans/presentation';
import {
	normalizedRecipeSchema,
	planDocumentSchema,
	recipeMaterialChangeSchema,
	recipeStepChangeSchema,
} from '@/lib/plans/schema';
import type {
	NormalizedRecipe,
	PlanDocument,
	PlanGenerationInput,
	PlanGenerationOptions,
	PlanMaterial,
	RecipeAdjustmentStatus,
	RecipeMaterialChange,
	RecipeStepChange,
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
	adjustedRecipe: NormalizedRecipe | null;
	adjustedForServings: number | null;
	adjustmentStatus: RecipeAdjustmentStatus;
	adjustmentError: string | null;
	adjustmentConfirmedAt: string | null;
	baseServings: number | null;
	materialChanges: RecipeMaterialChange[];
	stepChanges: RecipeStepChange[];
};

export type PlanEditorData = {
	id: string;
	title: string;
	status: 'draft' | 'ready' | 'archived';
	requestedServings: number | null;
	createdAt: string;
	updatedAt: string;
	recipes: PlanRecipeSnapshot[];
	activeVersion: ActivePlanVersionData | null;
	hasIncompatibleActiveVersion?: boolean;
};

const buildPlanMaterials = (
	recipes: PlanRecipeSnapshot[],
	requestedServings: number,
): PlanMaterial[] =>
	recipes.flatMap((recipe) => {
		const sourceIngredients =
			recipe.adjustedRecipe?.servings === requestedServings
				? recipe.adjustedRecipe.ingredients
				: (recipe.normalizedRecipe?.ingredients ?? []);

		return sourceIngredients.map((ingredient) =>
			scalePlanMaterial(
				{
					id: `${recipe.id}:${ingredient.id}`,
					name: ingredient.name,
					amount: ingredient.amount,
					amountValue: ingredient.amountValue,
					amountMin: ingredient.amountMin,
					amountMax: ingredient.amountMax,
					unit: ingredient.unit,
					recipeSourceId: recipe.id,
					sourceIngredientId: ingredient.id,
				},
				recipe.adjustedRecipe?.servings === requestedServings
					? requestedServings
					: (recipe.baseServings ?? recipe.normalizedRecipe?.servings),
				requestedServings,
			),
		);
	});

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
			createdAt: plans.createdAt,
			updatedAt: plans.updatedAt,
			activeVersionId: plans.activeVersionId,
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
		normalizedRecipe: parseNormalizedRecipe(recipe.normalizedRecipe),
		adjustedRecipe: parseNormalizedRecipe(recipe.adjustedRecipe),
		adjustedForServings: recipe.adjustedForServings,
		adjustmentStatus: recipe.adjustmentStatus,
		adjustmentError: recipe.adjustmentError,
		adjustmentConfirmedAt: recipe.adjustmentConfirmedAt?.toISOString() ?? null,
		baseServings:
			recipe.baseServingsOverride ??
			parseNormalizedRecipe(recipe.normalizedRecipe)?.servings ??
			null,
		materialChanges: parseMaterialChanges(recipe.materialChanges),
		stepChanges: parseStepChanges(recipe.stepChanges),
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
		createdAt: plan.createdAt.toISOString(),
		updatedAt: plan.updatedAt.toISOString(),
		recipes,
		hasIncompatibleActiveVersion: Boolean(activeVersion && !parsedActivePlan?.success),
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
		(recipe) =>
			recipe.processingStatus !== 'completed' ||
			!recipe.normalizedRecipe ||
			!recipe.adjustmentConfirmedAt ||
			recipe.adjustmentStatus === 'adjusting' ||
			recipe.adjustmentStatus === 'action_required' ||
			recipe.adjustmentStatus === 'needs_base_servings',
	);

	if (incompleteRecipe) {
		throw new Error('All recipes must be processed before generating a plan.');
	}

	const planningSettingsState = await getUserPlanningSettingsState(userId);
	const plannerContext = mergePlannerContext({
		availableEquipment: options.availableEquipment,
		constraints: options.constraints,
		settings: planningSettingsState.settings,
	});

	return {
		planId: plan.id,
		title: plan.title,
		requestedServings: options.requestedServings,
		availableEquipment: plannerContext.availableEquipment,
		constraints: plannerContext.constraints,
		planningSettings: planningSettingsState.settings,
		materials: buildPlanMaterials(plan.recipes, options.requestedServings),
		recipes: plan.recipes.map((recipe) => {
			const plannerRecipe =
				recipe.adjustedRecipe && recipe.adjustedForServings === options.requestedServings
					? recipe.adjustedRecipe
					: recipe.normalizedRecipe;

			return {
				recipeSourceId: recipe.id,
				sourceType: recipe.type === 'url' ? 'url' : 'manual',
				sourceUrl: recipe.type === 'url' ? recipe.label : null,
				title: recipe.title ?? recipe.label,
				summary: recipe.summary,
				normalizedRecipe: plannerRecipe as NormalizedRecipe,
			};
		}),
	};
};

export const saveGeneratedPlanVersion = async ({
	changeReason,
	changeSummary,
	planDocument,
	planId,
	requestedServings,
	userId,
}: {
	changeReason?: 'initial' | 'runtime_replan' | 'user_edit';
	changeSummary?: string;
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

	const requestedChangeReason = changeReason ?? null;
	const requestedChangeSummary = changeSummary ?? null;

	const insertedVersionResult = await db.execute<{
		changeSummary: string | null;
		createdAt: Date | string;
		id: string;
		planJson: PlanDocument | string;
		versionNumber: number;
	}>(sql`
		WITH plan_lock AS (
			SELECT pg_advisory_xact_lock(hashtext(${validPlanId})) AS locked
		),
		plan_row AS (
			SELECT ${plans.id} AS id, ${plans.activeVersionId} AS active_version_id
			FROM ${plans}, plan_lock
			WHERE ${plans.id} = ${validPlanId}
				AND ${plans.userId} = ${userId}
		),
		inserted_version AS (
			INSERT INTO ${planVersions} (
				${planVersions.planId},
				${planVersions.versionNumber},
				${planVersions.parentVersionId},
				${planVersions.changeReason},
				${planVersions.changeSummary},
				${planVersions.planJson},
				${planVersions.createdByUserId}
			)
			SELECT
				${validPlanId},
				coalesce(max(${planVersions.versionNumber}), 0) + 1,
				plan_row.active_version_id,
				coalesce(
					${requestedChangeReason}::plan_change_reason,
					CASE
						WHEN plan_row.active_version_id IS NULL THEN 'initial'::plan_change_reason
						ELSE 'user_edit'::plan_change_reason
					END
				),
				coalesce(
					${requestedChangeSummary},
					CASE
						WHEN plan_row.active_version_id IS NULL THEN 'AI が工程を生成しました。'
						ELSE 'AI が工程を再生成しました。'
					END
				),
				${JSON.stringify(planDocument)}::jsonb,
				${userId}
			FROM plan_row
			LEFT JOIN ${planVersions} ON ${planVersions.planId} = plan_row.id
			GROUP BY plan_row.id, plan_row.active_version_id
			RETURNING
				${planVersions.id} AS id,
				${planVersions.versionNumber} AS "versionNumber",
				${planVersions.changeSummary} AS "changeSummary",
				${planVersions.createdAt} AS "createdAt",
				${planVersions.planJson} AS "planJson"
		),
		updated_plan AS (
			UPDATE ${plans}
			SET
				${plans.activeVersionId} = inserted_version.id,
				${plans.requestedServings} = ${requestedServings},
				${plans.status} = 'ready'
			FROM inserted_version
			WHERE ${plans.id} = ${validPlanId}
				AND ${plans.userId} = ${userId}
			RETURNING inserted_version.id
		)
		SELECT *
		FROM inserted_version
	`);

	const insertedVersion = insertedVersionResult.rows[0];

	if (!insertedVersion) {
		throw new Error('Plan not found.');
	}

	const parsedPlan = planDocumentSchema.parse(
		typeof insertedVersion.planJson === 'string'
			? JSON.parse(insertedVersion.planJson)
			: insertedVersion.planJson,
	);

	return {
		id: insertedVersion.id,
		versionNumber: insertedVersion.versionNumber,
		changeSummary: insertedVersion.changeSummary,
		createdAt: new Date(insertedVersion.createdAt).toISOString(),
		plan: parsedPlan,
	};
};
