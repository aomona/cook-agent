import type { PlanningSettings } from '@/lib/planning-settings';

export type RecipeSourceMaterialAmountSummary = {
	text?: string | null;
	value?: number | null;
	min?: number | null;
	max?: number | null;
	unit?: string | null;
};

export type RecipeSourceMaterialSummary = {
	rawLine?: string | null;
	name: string;
	amount?: RecipeSourceMaterialAmountSummary | null;
	preparation?: string | null;
	optional?: boolean | null;
};

export type RecipeSourceRawContent = {
	inputText?: string;
	fetchedFrom?: string;
	provider?: string;
	title?: string;
	description?: string;
	servingsText?: string | null;
	ingredientsText?: string[];
	materials?: RecipeSourceMaterialSummary[];
	instructionsText?: string[];
	metadata?: Record<string, unknown>;
};

export type RecipeProcessingStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type NormalizedIngredient = {
	id: string;
	name: string;
	amount?: string;
	amountValue?: number;
	amountMin?: number;
	amountMax?: number;
	unit?: string;
	preparation?: string;
	optional?: boolean;
	substitutions?: string[];
};

export type NormalizedRecipeStep = {
	id: string;
	order: number;
	text: string;
	durationMinutes?: number;
	usesIngredientIds?: string[];
	outputs?: string[];
	notes?: string[];
};

export type NormalizedRecipe = {
	title: string;
	description?: string;
	servings?: number;
	ingredients: NormalizedIngredient[];
	steps: NormalizedRecipeStep[];
	metadata?: Record<string, unknown>;
};

export type RecipeAdjustmentStatus =
	| 'idle'
	| 'needs_base_servings'
	| 'adjusting'
	| 'completed'
	| 'action_required';

export type RecipeStepChangeType =
	| 'quantity'
	| 'heat'
	| 'time'
	| 'batching'
	| 'equipment'
	| 'sequence'
	| 'safety'
	| 'wording';

export type RecipeStepChangeConfidence = 'low' | 'medium' | 'high';

export type RecipeStepChange = {
	stepId: string;
	changeType: RecipeStepChangeType;
	reason: string;
	confidence: RecipeStepChangeConfidence;
};

export type PlanMaterial = {
	id: string;
	name: string;
	amount?: string;
	amountValue?: number;
	amountMin?: number;
	amountMax?: number;
	unit?: string;
	recipeSourceId?: string;
	sourceIngredientId?: string;
};

export type PlanGenerationRecipeInput = {
	recipeSourceId: string;
	sourceType: 'url' | 'manual';
	sourceUrl: string | null;
	title: string;
	summary: string | null;
	normalizedRecipe: NormalizedRecipe;
};

export type PlanGenerationOptions = {
	requestedServings: number;
	availableEquipment: string[];
	constraints: string[];
};

export type PlanGenerationInput = {
	planId: string;
	title: string;
	requestedServings: number;
	availableEquipment: string[];
	constraints: string[];
	planningSettings: PlanningSettings;
	materials: PlanMaterial[];
	recipes: PlanGenerationRecipeInput[];
};

export type PlanImprovementInput = {
	plannerInput: PlanGenerationInput;
	currentPlan: PlanDocument;
	improvementRequest: string;
};

export type PlanTimer = {
	id: string;
	label: string;
	seconds: number;
	autoStart?: boolean;
};

export type PlanStepKind = 'prep' | 'cook' | 'finish' | 'wait' | 'cleanup';

export type PlanStepTimeline = {
	start: number;
	end: number;
};

export type PlanStepResourceRequirements = Record<string, number>;

export type PlanMetadata = {
	availableEquipment: string[];
	constraints: string[];
	planningSettings?: PlanningSettings;
	recipeSourceIds: string[];
};

export type PlanStep = {
	id: string;
	label: string;
	instructions: string;
	timeline: PlanStepTimeline;
	time: number;
	after: string[];
	kind: PlanStepKind;
	recipeSourceId?: string;
	req?: PlanStepResourceRequirements;
	uses?: string[];
	slack?: number;
	notesForUser?: string[];
	recoveryTips?: string[];
	outputs?: string[];
	timers?: PlanTimer[];
	tags?: string[];
};

export type PlanDocument = {
	version: 2;
	title: string;
	servings: number;
	materials: PlanMaterial[];
	steps: PlanStep[];
	metadata?: PlanMetadata;
};

export type PlanPatchOperation = {
	op: 'add' | 'remove' | 'replace' | 'move';
	path: string;
	from?: string;
	value?: unknown;
};

export type PlanPatch = {
	baseVersionNumber: number;
	operations: PlanPatchOperation[];
	summary?: string;
};

export type SessionEventSeverity = 'info' | 'warning' | 'error';

export type SessionEventBasePayload = {
	message?: string;
	stepId?: string;
	metadata?: Record<string, unknown>;
};

export type SessionProgressEventPayload = SessionEventBasePayload & {
	stepId: string;
	status: 'started' | 'completed';
	severity?: SessionEventSeverity;
};

export type SessionDelayEventPayload = SessionEventBasePayload & {
	stepId: string;
	delayMinutes: number;
	severity?: SessionEventSeverity;
};

export type SessionMistakeEventPayload = SessionEventBasePayload & {
	stepId: string;
	severity?: SessionEventSeverity;
};

export type SessionIngredientShortageEventPayload = SessionEventBasePayload & {
	ingredientName: string;
	replacementOptions?: string[];
	severity?: SessionEventSeverity;
};

export type SessionUserRequestEventPayload = SessionEventBasePayload & {
	requestedChange: string;
	severity?: SessionEventSeverity;
};

export type SessionReplanAppliedEventPayload = SessionEventBasePayload & {
	appliedPatch: PlanPatch;
	severity?: SessionEventSeverity;
};

export type SessionTimerAction =
	| 'started'
	| 'paused'
	| 'resumed'
	| 'done'
	| 'cancelled'
	| 'adjusted';

export type SessionTimerEventPayload = SessionEventBasePayload & {
	timerId: string;
	action: SessionTimerAction;
	remainingSeconds?: number;
	severity?: SessionEventSeverity;
};

export type SessionEventPayloadByType = {
	progress: SessionProgressEventPayload;
	delay: SessionDelayEventPayload;
	mistake: SessionMistakeEventPayload;
	ingredient_shortage: SessionIngredientShortageEventPayload;
	user_request: SessionUserRequestEventPayload;
	replan_applied: SessionReplanAppliedEventPayload;
	timer: SessionTimerEventPayload;
};

export type SessionEventType = keyof SessionEventPayloadByType;

export type SessionEventPayload = SessionEventPayloadByType[SessionEventType];

export type SessionEventRecord = {
	[K in SessionEventType]: {
		eventType: K;
		payload: SessionEventPayloadByType[K];
	};
}[SessionEventType];
