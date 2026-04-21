import 'server-only';

import {
	FunctionCallingConfigMode,
	type FunctionDeclaration,
	GoogleGenAI,
	Modality,
	Type,
} from '@google/genai';
import { z } from 'zod';
import {
	fetchUrlTextWithTavily,
	tavilyFetchUrlInputSchema,
	tavilyWebSearchInputSchema,
	webSearchWithTavily,
} from '@/lib/ai/tavily';
import {
	cancelSessionTimer,
	completeCurrentCookingStep,
	moveCookingSessionToStep,
	pauseCookingSession,
	pauseSessionTimer,
	reportSessionDelay,
	reportSessionIngredientShortage,
	reportSessionMistake,
	requestRuntimeReplan,
	resumeCookingSession,
	resumeSessionTimer,
	startCookingSession,
	startSessionTimer,
} from '@/lib/cook-runtime/actions';
import {
	getOwnedCookSessionSnapshotByPlanId,
	getOwnedCookSessionSnapshotBySessionId,
} from '@/lib/cook-runtime/queries';
import type { CookSessionSnapshot } from '@/lib/cook-runtime/types';
import { getRequiredEnv } from '@/lib/env';

const geminiLiveModel = 'gemini-3.1-flash-live-preview';

const getGeminiClient = () =>
	new GoogleGenAI({
		apiKey: getRequiredEnv('GEMINI_API_KEY'),
		httpOptions: { apiVersion: 'v1alpha' },
	});

const functionDeclarations: FunctionDeclaration[] = [
	{
		name: 'get_runtime_snapshot',
		description: 'Get the latest cooking runtime state before making decisions.',
		parameters: {
			type: Type.OBJECT,
			properties: {},
		},
	},
	{
		name: 'start_cooking_session',
		description: 'Start or resume the cooking session for the current plan.',
		parameters: {
			type: Type.OBJECT,
			properties: {},
		},
	},
	{
		name: 'pause_cooking_session',
		description: 'Pause the current cooking session.',
		parameters: {
			type: Type.OBJECT,
			properties: {},
		},
	},
	{
		name: 'resume_cooking_session',
		description: 'Resume the current cooking session.',
		parameters: {
			type: Type.OBJECT,
			properties: {},
		},
	},
	{
		name: 'complete_current_step',
		description: 'Mark the current cooking step as completed and advance to the next step.',
		parameters: {
			type: Type.OBJECT,
			properties: {},
		},
	},
	{
		name: 'move_to_step',
		description: 'Move the active session to a specific step in the plan.',
		parameters: {
			type: Type.OBJECT,
			properties: {
				stepId: {
					type: Type.STRING,
					description: 'The plan step id to switch to.',
				},
			},
			required: ['stepId'],
		},
	},
	{
		name: 'start_timer',
		description: 'Start a plan timer for a given step.',
		parameters: {
			type: Type.OBJECT,
			properties: {
				stepId: {
					type: Type.STRING,
					description: 'The step id that owns this timer.',
				},
				timerId: {
					type: Type.STRING,
					description: 'The timer id from the current plan step.',
				},
			},
			required: ['stepId', 'timerId'],
		},
	},
	{
		name: 'pause_timer',
		description: 'Pause a running session timer.',
		parameters: {
			type: Type.OBJECT,
			properties: {
				timerRowId: {
					type: Type.STRING,
					description: 'The session timer row id.',
				},
			},
			required: ['timerRowId'],
		},
	},
	{
		name: 'resume_timer',
		description: 'Resume a paused session timer.',
		parameters: {
			type: Type.OBJECT,
			properties: {
				timerRowId: {
					type: Type.STRING,
					description: 'The session timer row id.',
				},
			},
			required: ['timerRowId'],
		},
	},
	{
		name: 'cancel_timer',
		description: 'Cancel an active session timer.',
		parameters: {
			type: Type.OBJECT,
			properties: {
				timerRowId: {
					type: Type.STRING,
					description: 'The session timer row id.',
				},
			},
			required: ['timerRowId'],
		},
	},
	{
		name: 'report_delay',
		description: 'Record that cooking is delayed.',
		parameters: {
			type: Type.OBJECT,
			properties: {
				delayMinutes: {
					type: Type.NUMBER,
					description: 'The delay in minutes.',
				},
				stepId: {
					type: Type.STRING,
					description: 'Optional current step id.',
				},
				message: {
					type: Type.STRING,
					description: 'Optional short summary in Japanese.',
				},
			},
			required: ['delayMinutes'],
		},
	},
	{
		name: 'report_mistake',
		description: 'Record a cooking mistake or unexpected problem.',
		parameters: {
			type: Type.OBJECT,
			properties: {
				stepId: {
					type: Type.STRING,
					description: 'Optional current step id.',
				},
				message: {
					type: Type.STRING,
					description: 'Short summary of the mistake in Japanese.',
				},
			},
			required: ['message'],
		},
	},
	{
		name: 'report_ingredient_shortage',
		description: 'Record that an ingredient is missing or short during cooking.',
		parameters: {
			type: Type.OBJECT,
			properties: {
				ingredientName: {
					type: Type.STRING,
					description: 'The missing ingredient name.',
				},
				stepId: {
					type: Type.STRING,
					description: 'Optional current step id.',
				},
				message: {
					type: Type.STRING,
					description: 'Optional short Japanese summary.',
				},
				replacementOptions: {
					type: Type.ARRAY,
					items: {
						type: Type.STRING,
					},
					description: 'Optional candidate substitutes.',
				},
			},
			required: ['ingredientName'],
		},
	},
	{
		name: 'request_replan',
		description: 'Request a runtime replan when the current plan no longer fits.',
		parameters: {
			type: Type.OBJECT,
			properties: {
				stepId: {
					type: Type.STRING,
					description: 'Optional current step id.',
				},
				message: {
					type: Type.STRING,
					description: 'What changed and why the plan should be revised.',
				},
			},
			required: ['message'],
		},
	},
	{
		name: 'web_search',
		description: 'Search the web with Tavily when runtime and recipe data are insufficient.',
		parameters: {
			type: Type.OBJECT,
			properties: {
				query: {
					type: Type.STRING,
					description: 'The search query.',
				},
				reason: {
					type: Type.STRING,
					description: 'Short reason for the search.',
				},
				includeDomains: {
					type: Type.ARRAY,
					items: {
						type: Type.STRING,
					},
					description: 'Optional domains to prioritize.',
				},
				maxResults: {
					type: Type.NUMBER,
					description: 'Optional max result count.',
				},
			},
			required: ['query', 'reason'],
		},
	},
	{
		name: 'fetch_url',
		description: 'Fetch a specific URL with Tavily after identifying a useful source.',
		parameters: {
			type: Type.OBJECT,
			properties: {
				url: {
					type: Type.STRING,
					description: 'The URL to inspect.',
				},
				reason: {
					type: Type.STRING,
					description: 'Short reason for opening the URL.',
				},
				query: {
					type: Type.STRING,
					description: 'Optional extraction focus.',
				},
			},
			required: ['url', 'reason'],
		},
	},
] as const;

type CookRuntimeToolName = NonNullable<(typeof functionDeclarations)[number]['name']>;

export const cookRuntimeToolNames = functionDeclarations
	.map((declaration) => declaration.name)
	.filter((name): name is CookRuntimeToolName => typeof name === 'string' && name.length > 0) as [
	CookRuntimeToolName,
	...CookRuntimeToolName[],
];

const allowedFunctionNames = cookRuntimeToolNames;

type ExecuteCookRuntimeToolParams = {
	planId: string;
	sessionId?: string;
	toolName: CookRuntimeToolName;
	args: unknown;
	userId: string;
};

type CookRuntimeToolContext = {
	planId: string;
	sessionId?: string;
	userId: string;
};

type ResolvedSessionToolContext = {
	resolvedSessionId: string;
	fallbackStepId: string;
};

type CookRuntimeToolHandler = (args: unknown, context: CookRuntimeToolContext) => Promise<unknown>;

const moveToStepSchema = z.object({
	stepId: z.string().trim().min(1).max(120),
});

const startTimerSchema = z.object({
	stepId: z.string().trim().min(1).max(120),
	timerId: z.string().trim().min(1).max(120),
});

const timerRowSchema = z.object({
	timerRowId: z.uuid(),
});

const reportDelaySchema = z.object({
	delayMinutes: z.number().int().min(1).max(240),
	stepId: z.string().trim().min(1).max(120).optional(),
	message: z.string().trim().min(1).max(500).optional(),
});

const reportMistakeSchema = z.object({
	stepId: z.string().trim().min(1).max(120).optional(),
	message: z.string().trim().min(1).max(500),
});

const reportIngredientShortageSchema = z.object({
	ingredientName: z.string().trim().min(1).max(120),
	stepId: z.string().trim().min(1).max(120).optional(),
	message: z.string().trim().min(1).max(500).optional(),
	replacementOptions: z.array(z.string().trim().min(1).max(120)).max(8).optional(),
});

const requestReplanSchema = z.object({
	stepId: z.string().trim().min(1).max(120).optional(),
	message: z.string().trim().min(1).max(500),
});

const summarizeSnapshotForModel = (snapshot: CookSessionSnapshot) => ({
	plan: {
		title: snapshot.plan.title,
		requestedServings: snapshot.plan.requestedServings,
		versionNumber: snapshot.plan.versionNumber,
		stepCount: snapshot.plan.document.steps.length,
	},
	session: snapshot.session
		? {
				id: snapshot.session.id,
				status: snapshot.session.status,
				currentStepId: snapshot.session.currentStepId,
			}
		: null,
	currentStep: snapshot.currentStep
		? {
				id: snapshot.currentStep.id,
				label: snapshot.currentStep.label,
				instructions: snapshot.currentStep.instructions,
				timeMinutes: snapshot.currentStep.time,
				notesForUser: snapshot.currentStep.notesForUser ?? [],
				recoveryTips: snapshot.currentStep.recoveryTips ?? [],
				timers: snapshot.currentStep.timers ?? [],
			}
		: null,
	nextStep: snapshot.nextStep
		? {
				id: snapshot.nextStep.id,
				label: snapshot.nextStep.label,
				instructions: snapshot.nextStep.instructions,
			}
		: null,
	runningTimers: snapshot.timers.map((timer) => ({
		id: timer.id,
		label: timer.label,
		remainingSeconds: timer.remainingSeconds,
		status: timer.status,
		stepId: timer.stepId,
	})),
	recentEvents: snapshot.recentEvents.slice(0, 6).map((event) => event.message),
});

const buildSystemInstruction = (snapshot: CookSessionSnapshot): string =>
	[
		'You are a realtime cooking runtime for a voice-first prototype.',
		'Speak natural Japanese only.',
		'Keep audio responses brief, concrete, and easy to follow while cooking.',
		'Prefer one or two short sentences, then stop unless the user asks for more.',
		'Never claim a step, timer, or session state changed until the corresponding tool call succeeds.',
		'Use get_runtime_snapshot whenever state may have changed or when you are unsure.',
		'Use web_search and fetch_url only when the plan and runtime state are insufficient.',
		'If the cooking session has not started, ask for confirmation briefly and then call start_cooking_session.',
		'When the user reports delay, mistakes, or ingredient shortages, record them with tools before giving concrete guidance.',
		'If the current plan no longer fits, call request_replan instead of pretending the plan is already updated.',
		'Current runtime summary JSON:',
		JSON.stringify(summarizeSnapshotForModel(snapshot), null, 2),
	].join('\n');

const buildFallbackSystemInstruction = (planId: string): string =>
	[
		'You are a realtime cooking runtime for a voice-first prototype.',
		'Speak natural Japanese only.',
		'Keep responses short and practical for someone actively cooking.',
		'Always call get_runtime_snapshot before making concrete decisions when current state is unclear.',
		'Never claim timers, steps, or session state changed until the matching tool call succeeds.',
		'Use web_search and fetch_url only when runtime state and the current plan are insufficient.',
		`Current planId: ${planId}`,
	].join('\n');

export const buildCookRuntimeLiveSessionPayload = async ({
	planId,
	userId,
}: {
	planId: string;
	userId: string;
}) => {
	let snapshot: CookSessionSnapshot | null = null;

	try {
		snapshot = await getOwnedCookSessionSnapshotByPlanId(planId, userId);
	} catch (error) {
		console.error('Failed to load cook runtime snapshot for live payload.', error);
	}

	const systemInstructionText = snapshot
		? buildSystemInstruction(snapshot)
		: buildFallbackSystemInstruction(planId);
	const liveConfig = {
		contextWindowCompression: { slidingWindow: {} },
		inputAudioTranscription: {},
		outputAudioTranscription: {},
		responseModalities: [Modality.AUDIO],
		sessionResumption: {},
		systemInstruction: {
			parts: [{ text: systemInstructionText }],
		},
		temperature: 0.6,
		toolConfig: {
			functionCallingConfig: {
				allowedFunctionNames,
				mode: FunctionCallingConfigMode.AUTO,
			},
		},
		tools: [{ functionDeclarations: [...functionDeclarations] }],
	};
	const token = await getGeminiClient().authTokens.create({
		config: {
			expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
			uses: 1,
			liveConnectConstraints: {
				model: geminiLiveModel,
				config: liveConfig,
			},
		},
	});

	return {
		config: liveConfig,
		model: geminiLiveModel,
		snapshot: snapshot ? summarizeSnapshotForModel(snapshot) : null,
		token: token.name,
	};
};

const getActiveSessionId = async ({
	planId,
	userId,
}: {
	planId: string;
	userId: string;
}): Promise<string | null> => {
	const snapshot = await getOwnedCookSessionSnapshotByPlanId(planId, userId);

	return snapshot?.session?.id ?? null;
};

const requireSessionId = async ({
	planId,
	providedSessionId,
	userId,
}: {
	planId: string;
	providedSessionId?: string;
	userId: string;
}): Promise<string> => {
	if (providedSessionId) {
		// When sessionId is provided, verify it belongs to the requested plan
		const snapshot = await getOwnedCookSessionSnapshotBySessionId(providedSessionId, userId);

		if (!snapshot) {
			throw new Error('Cooking session not found.');
		}

		if (snapshot.plan.id !== planId) {
			throw new Error('Session does not belong to the requested plan.');
		}

		return providedSessionId;
	}

	const sessionId = await getActiveSessionId({ planId, userId });

	if (!sessionId) {
		throw new Error('Active cooking session not found.');
	}

	return sessionId;
};

const requireCurrentStepId = async ({
	planId,
	providedSessionId,
	userId,
}: {
	planId: string;
	providedSessionId?: string;
	userId: string;
}): Promise<string> => {
	const snapshot = providedSessionId
		? await getOwnedCookSessionSnapshotBySessionId(providedSessionId, userId)
		: await getOwnedCookSessionSnapshotByPlanId(planId, userId);

	if (!snapshot) {
		throw new Error('Cooking session not found.');
	}

	// When sessionId is provided, verify it belongs to the requested plan
	if (providedSessionId && snapshot.plan.id !== planId) {
		throw new Error('Session does not belong to the requested plan.');
	}

	const stepId = snapshot.session?.currentStepId ?? snapshot.currentStep?.id ?? null;

	if (!stepId) {
		throw new Error('Current cooking step not found.');
	}

	return stepId;
};

const getSnapshotForTool = async ({
	planId,
	sessionId,
	userId,
}: CookRuntimeToolContext): Promise<CookSessionSnapshot | null> =>
	sessionId
		? getOwnedCookSessionSnapshotBySessionId(sessionId, userId)
		: getOwnedCookSessionSnapshotByPlanId(planId, userId);

const resolveSessionToolContext = async ({
	planId,
	sessionId,
	userId,
}: CookRuntimeToolContext): Promise<ResolvedSessionToolContext> => {
	const resolvedSessionId = await requireSessionId({
		planId,
		providedSessionId: sessionId,
		userId,
	});
	const fallbackStepId = await requireCurrentStepId({
		planId,
		providedSessionId: resolvedSessionId,
		userId,
	});

	return {
		resolvedSessionId,
		fallbackStepId,
	};
};

const summarizeRequiredToolSnapshot = (
	snapshot: CookSessionSnapshot | null,
	toolName: CookRuntimeToolName,
) => {
	if (!snapshot) {
		throw new Error(`Unsupported tool: ${toolName}`);
	}

	return summarizeSnapshotForModel(snapshot);
};

const cookRuntimeToolHandlers: Record<CookRuntimeToolName, CookRuntimeToolHandler> = {
	get_runtime_snapshot: async (_args, context) => {
		const snapshot = await getSnapshotForTool(context);

		if (!snapshot) {
			throw new Error('Cook session context not found.');
		}

		return summarizeSnapshotForModel(snapshot);
	},
	start_cooking_session: async (_args, context) =>
		summarizeSnapshotForModel(
			await startCookingSession({
				planId: context.planId,
				userId: context.userId,
			}),
		),
	pause_cooking_session: async (_args, context) => {
		const { resolvedSessionId } = await resolveSessionToolContext(context);

		return summarizeRequiredToolSnapshot(
			await pauseCookingSession({ sessionId: resolvedSessionId, userId: context.userId }),
			'pause_cooking_session',
		);
	},
	resume_cooking_session: async (_args, context) => {
		const { resolvedSessionId } = await resolveSessionToolContext(context);

		return summarizeRequiredToolSnapshot(
			await resumeCookingSession({ sessionId: resolvedSessionId, userId: context.userId }),
			'resume_cooking_session',
		);
	},
	complete_current_step: async (_args, context) => {
		const { resolvedSessionId } = await resolveSessionToolContext(context);

		return summarizeRequiredToolSnapshot(
			await completeCurrentCookingStep({ sessionId: resolvedSessionId, userId: context.userId }),
			'complete_current_step',
		);
	},
	move_to_step: async (args, context) => {
		const input = moveToStepSchema.parse(args);
		const { resolvedSessionId } = await resolveSessionToolContext(context);

		return summarizeRequiredToolSnapshot(
			await moveCookingSessionToStep({
				sessionId: resolvedSessionId,
				stepId: input.stepId,
				userId: context.userId,
			}),
			'move_to_step',
		);
	},
	start_timer: async (args, context) => {
		const input = startTimerSchema.parse(args);
		const { resolvedSessionId } = await resolveSessionToolContext(context);

		return summarizeRequiredToolSnapshot(
			await startSessionTimer({
				sessionId: resolvedSessionId,
				stepId: input.stepId,
				timerId: input.timerId,
				userId: context.userId,
			}),
			'start_timer',
		);
	},
	pause_timer: async (args, context) => {
		const input = timerRowSchema.parse(args);
		const { resolvedSessionId } = await resolveSessionToolContext(context);

		return summarizeRequiredToolSnapshot(
			await pauseSessionTimer({
				sessionId: resolvedSessionId,
				timerRowId: input.timerRowId,
				userId: context.userId,
			}),
			'pause_timer',
		);
	},
	resume_timer: async (args, context) => {
		const input = timerRowSchema.parse(args);
		const { resolvedSessionId } = await resolveSessionToolContext(context);

		return summarizeRequiredToolSnapshot(
			await resumeSessionTimer({
				sessionId: resolvedSessionId,
				timerRowId: input.timerRowId,
				userId: context.userId,
			}),
			'resume_timer',
		);
	},
	cancel_timer: async (args, context) => {
		const input = timerRowSchema.parse(args);
		const { resolvedSessionId } = await resolveSessionToolContext(context);

		return summarizeRequiredToolSnapshot(
			await cancelSessionTimer({
				sessionId: resolvedSessionId,
				timerRowId: input.timerRowId,
				userId: context.userId,
			}),
			'cancel_timer',
		);
	},
	report_delay: async (args, context) => {
		const input = reportDelaySchema.parse(args);
		const { fallbackStepId, resolvedSessionId } = await resolveSessionToolContext(context);

		return summarizeRequiredToolSnapshot(
			await reportSessionDelay({
				delayMinutes: input.delayMinutes,
				message: input.message,
				sessionId: resolvedSessionId,
				stepId: input.stepId ?? fallbackStepId,
				userId: context.userId,
			}),
			'report_delay',
		);
	},
	report_mistake: async (args, context) => {
		const input = reportMistakeSchema.parse(args);
		const { fallbackStepId, resolvedSessionId } = await resolveSessionToolContext(context);

		return summarizeRequiredToolSnapshot(
			await reportSessionMistake({
				message: input.message,
				sessionId: resolvedSessionId,
				stepId: input.stepId ?? fallbackStepId,
				userId: context.userId,
			}),
			'report_mistake',
		);
	},
	report_ingredient_shortage: async (args, context) => {
		const input = reportIngredientShortageSchema.parse(args);
		const { resolvedSessionId } = await resolveSessionToolContext(context);

		return summarizeRequiredToolSnapshot(
			await reportSessionIngredientShortage({
				ingredientName: input.ingredientName,
				message: input.message,
				replacementOptions: input.replacementOptions,
				sessionId: resolvedSessionId,
				stepId: input.stepId,
				userId: context.userId,
			}),
			'report_ingredient_shortage',
		);
	},
	request_replan: async (args, context) => {
		const input = requestReplanSchema.parse(args);
		const { resolvedSessionId } = await resolveSessionToolContext(context);

		return summarizeRequiredToolSnapshot(
			await requestRuntimeReplan({
				message: input.message,
				sessionId: resolvedSessionId,
				stepId: input.stepId,
				userId: context.userId,
			}),
			'request_replan',
		);
	},
	web_search: async (args) => {
		const input = tavilyWebSearchInputSchema.parse(args);

		return webSearchWithTavily(input);
	},
	fetch_url: async (args) => {
		const input = tavilyFetchUrlInputSchema.parse(args);

		return fetchUrlTextWithTavily(input);
	},
};

export const executeCookRuntimeTool = async ({
	args,
	planId,
	sessionId,
	toolName,
	userId,
}: ExecuteCookRuntimeToolParams) => {
	const handler = cookRuntimeToolHandlers[toolName];

	if (!handler) {
		throw new Error(`Unsupported tool: ${toolName}`);
	}

	return handler(args, {
		planId,
		sessionId,
		userId,
	});
};
