import { relations } from 'drizzle-orm';
import {
	foreignKey,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from 'drizzle-orm/pg-core';
import type {
	NormalizedRecipe,
	PlanDocument,
	PlanPatch,
	RecipeSourceRawContent,
	SessionEventPayload,
} from '@/lib/plans/types';
import { user } from './auth-schema';

export * from './auth-schema';

export const recipeSourceTypeEnum = pgEnum('recipe_source_type', ['url', 'manual']);

export const planStatusEnum = pgEnum('plan_status', ['draft', 'ready', 'archived']);

export const planChangeReasonEnum = pgEnum('plan_change_reason', [
	'initial',
	'user_edit',
	'runtime_replan',
]);

export const sessionStatusEnum = pgEnum('session_status', [
	'not_started',
	'active',
	'paused',
	'completed',
	'abandoned',
]);

export const sessionEventTypeEnum = pgEnum('session_event_type', [
	'progress',
	'delay',
	'mistake',
	'ingredient_shortage',
	'user_request',
	'replan_applied',
	'timer',
]);

export const timerStatusEnum = pgEnum('timer_status', ['running', 'paused', 'done', 'cancelled']);

const timestamps = {
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true })
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
};

export const recipeSources = pgTable(
	'recipe_sources',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		sourceUrl: text('source_url'),
		sourceType: recipeSourceTypeEnum('source_type').notNull().default('url'),
		title: text('title'),
		description: text('description'),
		servingsText: text('servings_text'),
		rawContent: jsonb('raw_content').$type<RecipeSourceRawContent>().notNull(),
		normalizedRecipe: jsonb('normalized_recipe').$type<NormalizedRecipe>(),
		fetchedAt: timestamp('fetched_at', { withTimezone: true }),
		...timestamps,
	},
	(table) => [
		index('recipe_sources_user_id_created_at_idx').on(table.userId, table.createdAt),
		index('recipe_sources_source_url_idx').on(table.sourceUrl),
	],
);

export const plans = pgTable(
	'plans',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		status: planStatusEnum('status').notNull().default('draft'),
		requestedServings: integer('requested_servings'),
		activeVersionId: uuid('active_version_id'),
		...timestamps,
	},
	(table) => [
		index('plans_user_id_updated_at_idx').on(table.userId, table.updatedAt),
		index('plans_active_version_id_idx').on(table.activeVersionId),
	],
);

export const planRecipeSources = pgTable(
	'plan_recipe_sources',
	{
		planId: uuid('plan_id')
			.notNull()
			.references(() => plans.id, { onDelete: 'cascade' }),
		recipeSourceId: uuid('recipe_source_id')
			.notNull()
			.references(() => recipeSources.id, { onDelete: 'cascade' }),
		sortOrder: integer('sort_order').notNull().default(0),
		...timestamps,
	},
	(table) => [
		primaryKey({ columns: [table.planId, table.recipeSourceId] }),
		index('plan_recipe_sources_plan_id_sort_order_idx').on(table.planId, table.sortOrder),
	],
);

export const planVersions = pgTable(
	'plan_versions',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		planId: uuid('plan_id')
			.notNull()
			.references(() => plans.id, { onDelete: 'cascade' }),
		versionNumber: integer('version_number').notNull(),
		parentVersionId: uuid('parent_version_id'),
		changeReason: planChangeReasonEnum('change_reason').notNull(),
		changeSummary: text('change_summary'),
		planJson: jsonb('plan_json').$type<PlanDocument>().notNull(),
		patchFromParent: jsonb('patch_from_parent').$type<PlanPatch>(),
		createdByUserId: text('created_by_user_id').references(() => user.id, {
			onDelete: 'set null',
		}),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		uniqueIndex('plan_versions_plan_id_id_idx').on(table.planId, table.id),
		uniqueIndex('plan_versions_plan_id_version_number_idx').on(table.planId, table.versionNumber),
		index('plan_versions_plan_id_created_at_idx').on(table.planId, table.createdAt),
	],
);

export const cookingSessions = pgTable(
	'cooking_sessions',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		planId: uuid('plan_id')
			.notNull()
			.references(() => plans.id, { onDelete: 'cascade' }),
		planVersionId: uuid('plan_version_id').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		status: sessionStatusEnum('status').notNull().default('not_started'),
		currentStepId: text('current_step_id'),
		startedAt: timestamp('started_at', { withTimezone: true }),
		completedAt: timestamp('completed_at', { withTimezone: true }),
		...timestamps,
	},
	(table) => [
		index('cooking_sessions_user_id_status_updated_at_idx').on(
			table.userId,
			table.status,
			table.updatedAt,
		),
		foreignKey({
			name: 'cooking_sessions_plan_version_same_plan_fk',
			columns: [table.planId, table.planVersionId],
			foreignColumns: [planVersions.planId, planVersions.id],
		}).onDelete('restrict'),
		index('cooking_sessions_plan_id_created_at_idx').on(table.planId, table.createdAt),
	],
);

export const sessionEvents = pgTable(
	'session_events',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		sessionId: uuid('session_id')
			.notNull()
			.references(() => cookingSessions.id, { onDelete: 'cascade' }),
		eventType: sessionEventTypeEnum('event_type').notNull(),
		stepId: text('step_id'),
		payload: jsonb('payload').$type<SessionEventPayload>().notNull(),
		occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index('session_events_session_id_occurred_at_idx').on(table.sessionId, table.occurredAt),
		index('session_events_event_type_idx').on(table.eventType),
	],
);

export const sessionTimers = pgTable(
	'session_timers',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		sessionId: uuid('session_id')
			.notNull()
			.references(() => cookingSessions.id, { onDelete: 'cascade' }),
		stepId: text('step_id').notNull(),
		label: text('label').notNull(),
		durationSeconds: integer('duration_seconds').notNull(),
		remainingSeconds: integer('remaining_seconds'),
		status: timerStatusEnum('status').notNull().default('running'),
		startedAt: timestamp('started_at', { withTimezone: true }),
		endsAt: timestamp('ends_at', { withTimezone: true }),
		...timestamps,
	},
	(table) => [
		index('session_timers_session_id_status_idx').on(table.sessionId, table.status),
		index('session_timers_session_id_step_id_idx').on(table.sessionId, table.stepId),
	],
);

export const recipeSourcesRelations = relations(recipeSources, ({ one, many }) => ({
	user: one(user, {
		fields: [recipeSources.userId],
		references: [user.id],
	}),
	planRecipeSources: many(planRecipeSources),
}));

export const plansRelations = relations(plans, ({ one, many }) => ({
	user: one(user, {
		fields: [plans.userId],
		references: [user.id],
	}),
	activeVersion: one(planVersions, {
		relationName: 'plans_active_version',
		fields: [plans.activeVersionId],
		references: [planVersions.id],
	}),
	planRecipeSources: many(planRecipeSources),
	versions: many(planVersions, {
		relationName: 'plan_versions_plan',
	}),
	cookingSessions: many(cookingSessions),
}));

export const planRecipeSourcesRelations = relations(planRecipeSources, ({ one }) => ({
	plan: one(plans, {
		fields: [planRecipeSources.planId],
		references: [plans.id],
	}),
	recipeSource: one(recipeSources, {
		fields: [planRecipeSources.recipeSourceId],
		references: [recipeSources.id],
	}),
}));

export const planVersionsRelations = relations(planVersions, ({ one, many }) => ({
	plan: one(plans, {
		relationName: 'plan_versions_plan',
		fields: [planVersions.planId],
		references: [plans.id],
	}),
	activeForPlans: many(plans, {
		relationName: 'plans_active_version',
	}),
	parentVersion: one(planVersions, {
		fields: [planVersions.parentVersionId],
		references: [planVersions.id],
		relationName: 'plan_version_parent',
	}),
	childVersions: many(planVersions, {
		relationName: 'plan_version_parent',
	}),
	createdByUser: one(user, {
		fields: [planVersions.createdByUserId],
		references: [user.id],
	}),
	cookingSessions: many(cookingSessions),
}));

export const cookingSessionsRelations = relations(cookingSessions, ({ one, many }) => ({
	plan: one(plans, {
		fields: [cookingSessions.planId],
		references: [plans.id],
	}),
	planVersion: one(planVersions, {
		fields: [cookingSessions.planVersionId],
		references: [planVersions.id],
	}),
	user: one(user, {
		fields: [cookingSessions.userId],
		references: [user.id],
	}),
	events: many(sessionEvents),
	timers: many(sessionTimers),
}));

export const sessionEventsRelations = relations(sessionEvents, ({ one }) => ({
	session: one(cookingSessions, {
		fields: [sessionEvents.sessionId],
		references: [cookingSessions.id],
	}),
}));

export const sessionTimersRelations = relations(sessionTimers, ({ one }) => ({
	session: one(cookingSessions, {
		fields: [sessionTimers.sessionId],
		references: [cookingSessions.id],
	}),
}));
