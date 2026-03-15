export type RecipeSourceRawContent = {
	url?: string;
	fetchedFrom?: string;
	provider?: string;
	title?: string;
	description?: string;
	servingsText?: string;
	ingredientsText?: string[];
	instructionsText?: string[];
	metadata?: Record<string, unknown>;
};

export type NormalizedIngredient = {
	id: string;
	name: string;
	amount?: string;
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

export type PlanTimer = {
	id: string;
	label: string;
	seconds: number;
	autoStart?: boolean;
};

export type PlanStepIngredientRef = {
	ingredientId: string;
	preparation?: string;
	quantity?: string;
};

export type PlanStep = {
	id: string;
	title: string;
	description: string;
	dependsOn: string[];
	estimatedMinutes: number;
	recipeSourceId?: string;
	recovery?: string;
	ingredients?: PlanStepIngredientRef[];
	outputs?: string[];
	timers?: PlanTimer[];
	tags?: string[];
};

export type PlanDocument = {
	version: number;
	title: string;
	servings: number;
	steps: PlanStep[];
	metadata?: Record<string, unknown>;
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

export type SessionEventPayload = {
	message?: string;
	stepId?: string;
	severity?: 'info' | 'warning' | 'error';
	delayMinutes?: number;
	ingredientName?: string;
	replacementOptions?: string[];
	requestedChange?: string;
	appliedPatch?: PlanPatch;
	metadata?: Record<string, unknown>;
};
