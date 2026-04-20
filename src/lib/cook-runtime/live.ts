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

const allowedFunctionNames = functionDeclarations
	.map((declaration) => declaration.name)
	.filter((name): name is string => typeof name === 'string' && name.length > 0);

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

	if (!snapshot) {
		throw new Error('No owned snapshot found for plan.');
	}

	const systemInstructionText = buildSystemInstruction(snapshot);
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

export const executeCookRuntimeTool = async ({
	args,
	planId,
	sessionId,
	toolName,
	userId,
}: {
	planId: string;
	sessionId?: string;
	toolName: (typeof functionDeclarations)[number]['name'];
	args: unknown;
	userId: string;
}) => {
	if (toolName === 'get_runtime_snapshot') {
		const snapshot = sessionId
			? await getOwnedCookSessionSnapshotBySessionId(sessionId, userId)
			: await getOwnedCookSessionSnapshotByPlanId(planId, userId);

		if (!snapshot) {
			throw new Error('Cook session context not found.');
		}

		return summarizeSnapshotForModel(snapshot);
	}

	if (toolName === 'web_search') {
		return webSearchWithTavily(tavilyWebSearchInputSchema.parse(args));
	}

	if (toolName === 'fetch_url') {
		return fetchUrlTextWithTavily(tavilyFetchUrlInputSchema.parse(args));
	}

	if (toolName === 'start_cooking_session') {
		return summarizeSnapshotForModel(
			await startCookingSession({
				planId,
				userId,
			}),
		);
	}

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

	const snapshot =
		toolName === 'pause_cooking_session'
			? await pauseCookingSession({ sessionId: resolvedSessionId, userId })
			: toolName === 'resume_cooking_session'
				? await resumeCookingSession({ sessionId: resolvedSessionId, userId })
				: toolName === 'complete_current_step'
					? await completeCurrentCookingStep({ sessionId: resolvedSessionId, userId })
					: toolName === 'move_to_step'
						? await moveCookingSessionToStep({
								sessionId: resolvedSessionId,
								stepId: moveToStepSchema.parse(args).stepId,
								userId,
							})
						: toolName === 'start_timer'
							? await startSessionTimer({
									sessionId: resolvedSessionId,
									stepId: startTimerSchema.parse(args).stepId,
									timerId: startTimerSchema.parse(args).timerId,
									userId,
								})
							: toolName === 'pause_timer'
								? await pauseSessionTimer({
										sessionId: resolvedSessionId,
										timerRowId: timerRowSchema.parse(args).timerRowId,
										userId,
									})
								: toolName === 'resume_timer'
									? await resumeSessionTimer({
											sessionId: resolvedSessionId,
											timerRowId: timerRowSchema.parse(args).timerRowId,
											userId,
										})
									: toolName === 'cancel_timer'
										? await cancelSessionTimer({
												sessionId: resolvedSessionId,
												timerRowId: timerRowSchema.parse(args).timerRowId,
												userId,
											})
										: toolName === 'report_delay'
											? await reportSessionDelay({
													delayMinutes: reportDelaySchema.parse(args).delayMinutes,
													message: reportDelaySchema.parse(args).message,
													sessionId: resolvedSessionId,
													stepId: reportDelaySchema.parse(args).stepId ?? fallbackStepId,
													userId,
												})
											: toolName === 'report_mistake'
												? await reportSessionMistake({
														message: reportMistakeSchema.parse(args).message,
														sessionId: resolvedSessionId,
														stepId: reportMistakeSchema.parse(args).stepId ?? fallbackStepId,
														userId,
													})
												: toolName === 'report_ingredient_shortage'
													? await reportSessionIngredientShortage({
															ingredientName:
																reportIngredientShortageSchema.parse(args).ingredientName,
															message: reportIngredientShortageSchema.parse(args).message,
															replacementOptions:
																reportIngredientShortageSchema.parse(args).replacementOptions,
															sessionId: resolvedSessionId,
															stepId: reportIngredientShortageSchema.parse(args).stepId,
															userId,
														})
													: await requestRuntimeReplan({
															message: requestReplanSchema.parse(args).message,
															sessionId: resolvedSessionId,
															stepId: requestReplanSchema.parse(args).stepId,
															userId,
														});

	if (!snapshot) {
		throw new Error(`Unsupported tool: ${toolName}`);
	}

	return summarizeSnapshotForModel(snapshot);
};