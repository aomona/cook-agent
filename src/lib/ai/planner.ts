import 'server-only';

import { createOpenAI } from '@ai-sdk/openai';
import { Output, stepCountIs, ToolLoopAgent, tool } from 'ai';
import { z } from 'zod';
import { getRequiredEnv } from '@/lib/env';
import { assertSafePublicHttpUrl } from '@/lib/network/safe-url';
import { planDocumentSchema } from '@/lib/plans/schema';
import type { PlanDocument, PlanGenerationInput, PlanImprovementInput } from '@/lib/plans/types';

const openai = createOpenAI({
	apiKey: getRequiredEnv('OPENAI_API_KEY'),
});
const tavilyApiKey = getRequiredEnv('TAVILY_API_KEY');
const tavilyBaseUrl = 'https://api.tavily.com';

const plannerReqSchema = z
	.object({})
	.catchall(z.number().int().positive().max(8))
	.refine((value) => Object.keys(value).length <= 10, {
		message: 'req can include at most 10 resource keys.',
	});

const plannerStepTimelineSchema = z
	.object({
		start: z
			.number()
			.nonnegative()
			.max(24 * 60),
		end: z
			.number()
			.positive()
			.max(24 * 60),
	})
	.refine((value) => value.end > value.start, {
		message: 'timeline.end must be greater than timeline.start.',
	});

const plannerOutputSchema = z.object({
	version: z.literal(2),
	title: z.string().trim().min(1).max(160),
	servings: z.number().int().positive().max(100),
	steps: z
		.array(
			z.object({
				id: z.string().trim().min(1).max(120),
				label: z.string().trim().min(1).max(160),
				instructions: z.string().trim().min(1).max(1000),
				timeline: plannerStepTimelineSchema,
				time: z
					.number()
					.positive()
					.max(24 * 60),
				after: z.array(z.string().trim().min(1).max(120)).max(30),
				kind: z.enum(['prep', 'cook', 'finish', 'wait', 'cleanup']),
				recipeSourceId: z.uuid().nullable(),
				req: plannerReqSchema.nullable(),
				uses: z.array(z.string().trim().min(1).max(120)).max(40).nullable(),
				slack: z
					.number()
					.nonnegative()
					.max(24 * 60)
					.nullable(),
				notesForUser: z.array(z.string().trim().min(1).max(200)).max(10).nullable(),
				recoveryTips: z.array(z.string().trim().min(1).max(200)).max(10).nullable(),
				outputs: z.array(z.string().trim().min(1).max(120)).max(10).nullable(),
				timers: z
					.array(
						z.strictObject({
							id: z.string().trim().min(1).max(100),
							label: z.string().trim().min(1).max(120),
							seconds: z
								.number()
								.int()
								.positive()
								.max(60 * 60 * 12),
							autoStart: z.boolean().nullable(),
						}),
					)
					.max(5)
					.nullable(),
				tags: z.array(z.string().trim().min(1).max(40)).max(10).nullable(),
			}),
		)
		.min(1)
		.max(80),
});

const plannerOutput = Output.object({
	schema: plannerOutputSchema,
	name: 'cooking_plan',
	description: 'Timeline-first cooking execution plan with explicit schedule and resource usage.',
});

const buildPlanMetadata = (input: PlanGenerationInput) => ({
	availableEquipment: input.availableEquipment,
	constraints: input.constraints,
	planningSettings: input.planningSettings,
	recipeSourceIds: input.recipes.map((recipe) => recipe.recipeSourceId),
});

const finalizePlanDocument = ({
	input,
	output,
}: {
	input: PlanGenerationInput;
	output: z.infer<typeof plannerOutputSchema>;
}): PlanDocument =>
	planDocumentSchema.parse({
		...output,
		materials: input.materials,
		metadata: buildPlanMetadata(input),
	});

const webSearchToolInputSchema = z.object({
	query: z.string().trim().min(1).max(240),
	reason: z.string().trim().min(1).max(120),
	includeDomains: z.array(z.string().trim().min(1).max(120)).max(10).optional(),
	maxResults: z.number().int().min(1).max(8).optional(),
});

const fetchUrlToolInputSchema = z.object({
	url: z.url(),
	reason: z.string().trim().min(1).max(120),
	query: z.string().trim().min(1).max(240).optional(),
});

const tavilySearchResultSchema = z.object({
	title: z.string().catch(''),
	url: z.url(),
	content: z.string().catch(''),
	raw_content: z.string().nullable().optional(),
	score: z.number().nullable().optional(),
	published_date: z.string().nullable().optional(),
});

const tavilySearchResponseSchema = z.object({
	answer: z.string().nullable().optional(),
	results: z.array(tavilySearchResultSchema),
	request_id: z.string().optional(),
	usage: z
		.object({
			credits: z.number().optional(),
		})
		.optional(),
});

const tavilyExtractResultSchema = z.object({
	url: z.url(),
	raw_content: z.string(),
});

const tavilyExtractResponseSchema = z.object({
	results: z.array(tavilyExtractResultSchema),
	request_id: z.string().optional(),
});

const truncateText = (value: string, maxLength: number): string =>
	value.length <= maxLength ? value : value.slice(0, maxLength);

const postTavily = async <TSchema extends z.ZodType>({
	path,
	body,
	schema,
}: {
	path: '/search' | '/extract';
	body: Record<string, unknown>;
	schema: TSchema;
}): Promise<z.infer<TSchema>> => {
	const response = await fetch(`${tavilyBaseUrl}${path}`, {
		cache: 'no-store',
		method: 'POST',
		headers: {
			Authorization: `Bearer ${tavilyApiKey}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(body),
	});

	if (!response.ok) {
		throw new Error(
			`Tavily ${path} failed (${response.status}): ${truncateText(await response.text(), 500)}`,
		);
	}

	return schema.parse(await response.json());
};

const createWebSearchTool = () =>
	tool({
		description:
			'Search the public web with Tavily when the provided recipes are insufficient and you need outside cooking or food-safety context.',
		inputSchema: webSearchToolInputSchema,
		execute: async ({ query, includeDomains, maxResults }) => {
			const response = await postTavily({
				path: '/search',
				body: {
					query,
					search_depth: 'basic',
					topic: 'general',
					max_results: maxResults ?? 5,
					include_answer: false,
					include_raw_content: false,
					include_domains: includeDomains,
				},
				schema: tavilySearchResponseSchema,
			});

			return {
				answer: response.answer ?? null,
				creditsUsed: response.usage?.credits ?? null,
				query,
				requestId: response.request_id ?? null,
				results: response.results.map((result) => ({
					content: truncateText(result.content || result.raw_content || '', 1200),
					publishedDate: result.published_date ?? null,
					score: result.score ?? null,
					title: result.title || result.url,
					url: result.url,
				})),
			};
		},
	});

const createFetchUrlTool = () =>
	tool({
		description:
			'Fetch and extract plain text from a specific public URL with Tavily after you have identified a promising source.',
		inputSchema: fetchUrlToolInputSchema,
		execute: async ({ url, query }) => {
			const safeUrl = await assertSafePublicHttpUrl(url);
			const response = await postTavily({
				path: '/extract',
				body: {
					urls: [safeUrl.toString()],
					extract_depth: 'basic',
					format: 'text',
					include_images: false,
					include_favicon: false,
					query,
				},
				schema: tavilyExtractResponseSchema,
			});
			const [result] = response.results;

			if (!result) {
				throw new Error('Tavily extract returned no results.');
			}

			return {
				requestId: response.request_id ?? null,
				text: truncateText(result.raw_content, 12000),
				url: result.url,
			};
		},
	});

const buildPrompt = (input: PlanGenerationInput): string =>
	[
		'Build a structured cooking execution plan for a prototype cooking agent.',
		'The primary goal is to finish all dishes at the same time in a realistic kitchen workflow.',
		'First think about the overall flow, then organize work across prep, heating, and assembly lanes.',
		'Use the provided normalized recipes as the primary source of truth.',
		'Use web tools sparingly and only when the recipe data is insufficient.',
		'Use web_search to look up missing cooking knowledge, safety guidance, or equipment-specific technique.',
		'Use fetch_url to inspect a specific source after search, or to re-read a recipe sourceUrl already present in the input.',
		'Prefer conservative safe assumptions over unnecessary searching or fetching.',
		'If a recipe serving count is missing or ambiguous, do not infer it from weak clues; rely on explicit user input in the provided planning context.',
		'Use the structured planningSettings object as the source of truth for saved kitchen defaults, and the normalized availableEquipment and constraints arrays as the final planner-ready summary.',
		'Respect available equipment and listed constraints. Never assume unavailable equipment.',
		'Important rules:',
		'- Output must be JSON only.',
		'- Do not output explanations or Markdown.',
		'- Follow the provided schema strictly.',
		'- All human-readable text fields in the output must be written in natural Japanese.',
		'- Keep only schema keys, ids, recipeSourceId values, req keys, kind enum values, and the cleanup tag in their required machine-readable forms.',
		'- Do not copy recipe instructions verbatim; decompose them into executable kitchen tasks.',
		'- Prefer more fine-grained tasks over coarse summaries.',
		'- Prefer task durations of 2 to 6 minutes when practical.',
		'- Split combined recipe instructions into multiple tasks whenever that improves execution clarity.',
		'- Prefer roughly 14 to 40 steps unless the meal is genuinely simple.',
		'- Do not omit fields required by the schema; use null when a nullable field has no value.',
		'- Use explicit timeline windows instead of implicit scheduling heuristics.',
		'- Express all ordering constraints explicitly in after.',
		'- Put safety-critical guidance in notesForUser or recoveryTips.',
		'- The goal is completing the meal, not writing polished prose.',
		'- If information is missing, choose the most conservative safe assumption.',
		'- If servings information is missing or ambiguous, treat the user-provided requestedServings and any explicit per-recipe servings in the input as the only trusted serving counts.',
		'Planning policy:',
		'- Think through the full meal flow before writing steps.',
		'- Break long prep, heating, waiting, and finishing work into smaller executable units.',
		'- Use overlapping timelines only when after constraints and req resources make that overlap realistic.',
		'- Fill waiting time with other work when possible.',
		'- If there is idle time or cleanup load is likely to accumulate, add explicit washing/cleanup steps during the workflow to reduce the final burden.',
		'- Avoid overloading the final minutes before serving.',
		'- Add timers wherever they materially help execution.',
		'Field guidance:',
		'- Use exactly these JSON field names: version, title, servings, steps, id, label, instructions, timeline, start, end, time, after, kind, recipeSourceId, req, uses, slack, notesForUser, recoveryTips, outputs, timers, tags.',
		'- title, label, instructions, timer labels, notesForUser, recoveryTips, and outputs must be Japanese text.',
		'- Step IDs must be unique across the full combined meal. Use the format <recipeSourceId>:<stepKey> whenever a step belongs to a specific recipe.',
		'- after must contain only earlier step IDs and must never include the same step id.',
		'- timeline.start and timeline.end are minutes from the beginning of the meal plan.',
		'- time must equal timeline.end - timeline.start.',
		'- kind must be one of prep, cook, finish, wait, cleanup.',
		'- Use recipeSourceId whenever a step clearly comes from one recipe.',
		'- Use req to describe resource usage such as stove, hands, oven, bowl, knife, or board.',
		'- Use the material IDs from the provided planning context materials list when filling uses.',
		'- Timer durations must be in seconds.',
		'- Use slack to represent how many minutes the start can move later without breaking the plan.',
		'- When a step is mainly washing dishes, tidying tools, or resetting the workspace, use kind=cleanup and include the tag cleanup in tags.',
		'- For nullable fields with no value, return null instead of omitting the key.',
		'- Do not output materials or metadata; the system will attach them from the planning context.',
		'',
		JSON.stringify(input, null, 2),
	].join('\n');

const buildImprovementPrompt = ({
	currentPlan,
	improvementRequest,
	plannerInput,
}: PlanImprovementInput): string =>
	[
		'Revise an existing structured cooking execution plan for a prototype cooking agent.',
		'Keep the plan practical in a real kitchen and optimize for all dishes finishing together.',
		'Preserve good parts of the current plan and only change what is needed to satisfy the improvement request.',
		'First reconsider the full workflow, then update prep, heating, and assembly balance as needed.',
		'Use the provided normalized recipes as the primary source of truth.',
		'Use web tools sparingly and only when the recipe data and current plan are insufficient.',
		'Use web_search to look up missing cooking knowledge, safety guidance, or equipment-specific technique.',
		'Use fetch_url to inspect a specific source after search, or to re-read a recipe sourceUrl already present in the input.',
		'Prefer conservative safe assumptions over unnecessary searching or fetching.',
		'If a recipe serving count is missing or ambiguous, do not infer it from weak clues; rely on explicit user input in the provided planning context.',
		'Use the structured planningSettings object as the source of truth for saved kitchen defaults, and the normalized availableEquipment and constraints arrays as the final planner-ready summary.',
		'Respect available equipment and listed constraints. Never assume unavailable equipment.',
		'Important rules:',
		'- Output must be JSON only.',
		'- Do not output explanations or Markdown.',
		'- Follow the provided schema strictly.',
		'- All human-readable text fields in the output must be written in natural Japanese.',
		'- Keep only schema keys, ids, recipeSourceId values, req keys, kind enum values, and the cleanup tag in their required machine-readable forms.',
		'- Do not copy recipe instructions verbatim; decompose them into executable kitchen tasks.',
		'- Keep existing step IDs when a step remains substantially the same.',
		'- Use new step IDs only for newly introduced steps.',
		'- Remove obsolete steps instead of leaving dead branches.',
		'- Do not omit fields required by the schema; use null when a nullable field has no value.',
		'- Use explicit timeline windows instead of implicit scheduling heuristics.',
		'- Express all ordering constraints explicitly in after.',
		'- Put safety-critical guidance in notesForUser or recoveryTips.',
		'- The goal is completing the meal, not writing polished prose.',
		'- If information is missing, choose the most conservative safe assumption.',
		'- If servings information is missing or ambiguous, treat the user-provided requestedServings and any explicit per-recipe servings in the input as the only trusted serving counts.',
		'Planning policy:',
		'- Think through the full meal flow before writing steps.',
		'- Break long prep, heating, waiting, and finishing work into smaller executable units.',
		'- Use overlapping timelines only when after constraints and req resources make that overlap realistic.',
		'- Fill waiting time with other work when possible.',
		'- If there is idle time or cleanup load is likely to accumulate, add explicit washing/cleanup steps during the workflow to reduce the final burden.',
		'- Avoid overloading the final minutes before serving.',
		'- Add timers wherever they materially help execution.',
		'Field guidance:',
		'- Use exactly these JSON field names: version, title, servings, steps, id, label, instructions, timeline, start, end, time, after, kind, recipeSourceId, req, uses, slack, notesForUser, recoveryTips, outputs, timers, tags.',
		'- title, label, instructions, timer labels, notesForUser, recoveryTips, and outputs must be Japanese text.',
		'- Step IDs must be unique across the full combined meal. Use the format <recipeSourceId>:<stepKey> whenever a step belongs to a specific recipe.',
		'- after must contain only earlier step IDs and must never include the same step id.',
		'- timeline.start and timeline.end are minutes from the beginning of the meal plan.',
		'- time must equal timeline.end - timeline.start.',
		'- kind must be one of prep, cook, finish, wait, cleanup.',
		'- Use recipeSourceId whenever a step clearly comes from one recipe.',
		'- Use req to describe resource usage such as stove, hands, oven, bowl, knife, or board.',
		'- Use the material IDs from the provided planning context materials list when filling uses.',
		'- Timer durations must be in seconds.',
		'- Use slack to represent how many minutes the start can move later without breaking the plan.',
		'- When a step is mainly washing dishes, tidying tools, or resetting the workspace, use kind=cleanup and include the tag cleanup in tags.',
		'- For nullable fields with no value, return null instead of omitting the key.',
		'- Do not output materials or metadata; the system will attach them from the planning context.',
		'',
		'Improvement request:',
		improvementRequest,
		'',
		'Current plan JSON:',
		JSON.stringify(currentPlan, null, 2),
		'',
		'Planning context JSON:',
		JSON.stringify(plannerInput, null, 2),
	].join('\n');

export type PlannerStreamEvent =
	| { type: 'status'; message: string }
	| { type: 'reasoning'; delta: string }
	| { type: 'tool'; message: string };

const createPlannerAgent = () =>
	new ToolLoopAgent({
		model: openai('gpt-5.4-mini'),
		maxOutputTokens: 100000,
		maxRetries: 0,
		timeout: {
			totalMs: 180000,
		},
		instructions: [
			'Plan kitchen work for a cooking prototype.',
			'Think carefully about full-meal timing so dishes land together.',
			'Think carefully about ordering, timing, resource contention, and failure recovery.',
			'Write all human-readable output text in Japanese.',
			'When realistic, insert cleanup or dishwashing work into idle windows so the final minutes stay lighter.',
			'Use Tavily web tools only when missing information blocks a better plan.',
			'Prefer the provided normalized recipes over web results whenever they are sufficient.',
			'Keep the final plan grounded in the provided recipes, materials, and constraints.',
		].join(' '),
		tools: {
			fetch_url: createFetchUrlTool(),
			web_search: createWebSearchTool(),
		},
		stopWhen: stepCountIs(6),
		output: plannerOutput,
		providerOptions: {
			openai: {
				maxToolCalls: 3,
				parallelToolCalls: false,
				reasoningEffort: 'medium',
				reasoningSummary: 'auto',
				textVerbosity: 'low',
			},
		},
	});

export const generateCookingPlan = async (input: PlanGenerationInput): Promise<PlanDocument> => {
	const plannerAgent = createPlannerAgent();

	const result = await plannerAgent.generate({
		prompt: buildPrompt(input),
	});

	return finalizePlanDocument({
		input,
		output: result.output,
	});
};

export const streamCookingPlan = async ({
	input,
	onEvent,
	abortSignal,
}: {
	input: PlanGenerationInput;
	onEvent?: (event: PlannerStreamEvent) => Promise<void> | void;
	abortSignal?: AbortSignal;
}): Promise<PlanDocument> => {
	const plannerAgent = createPlannerAgent();
	const result = await plannerAgent.stream({
		abortSignal,
		prompt: buildPrompt(input),
	});

	for await (const part of result.fullStream) {
		if (part.type === 'start-step') {
			await onEvent?.({
				type: 'status',
				message: '次の推論ステップを開始しました。',
			});
			continue;
		}

		if (part.type === 'reasoning-delta') {
			await onEvent?.({
				type: 'reasoning',
				delta: part.text,
			});
			continue;
		}

		if (part.type === 'tool-input-start') {
			await onEvent?.({
				type: 'tool',
				message: `補助ツールを実行中: ${part.toolName}`,
			});
			continue;
		}

		if (part.type === 'tool-result') {
			await onEvent?.({
				type: 'tool',
				message: `補助ツールが完了: ${part.toolName}`,
			});
			continue;
		}

		if (part.type === 'finish-step') {
			await onEvent?.({
				type: 'status',
				message: `推論ステップ完了: ${part.finishReason}`,
			});
		}
	}

	const planDocument = finalizePlanDocument({
		input,
		output: await result.output,
	});

	return planDocument;
};

export const improveCookingPlan = async (input: PlanImprovementInput): Promise<PlanDocument> => {
	const plannerAgent = createPlannerAgent();
	const result = await plannerAgent.generate({
		prompt: buildImprovementPrompt(input),
	});

	return finalizePlanDocument({
		input: input.plannerInput,
		output: result.output,
	});
};

export const streamImproveCookingPlan = async ({
	input,
	onEvent,
	abortSignal,
}: {
	input: PlanImprovementInput;
	onEvent?: (event: PlannerStreamEvent) => Promise<void> | void;
	abortSignal?: AbortSignal;
}): Promise<PlanDocument> => {
	const plannerAgent = createPlannerAgent();
	const result = await plannerAgent.stream({
		abortSignal,
		prompt: buildImprovementPrompt(input),
	});

	for await (const part of result.fullStream) {
		if (part.type === 'start-step') {
			await onEvent?.({
				type: 'status',
				message: '次の推論ステップを開始しました。',
			});
			continue;
		}

		if (part.type === 'reasoning-delta') {
			await onEvent?.({
				type: 'reasoning',
				delta: part.text,
			});
			continue;
		}

		if (part.type === 'tool-input-start') {
			await onEvent?.({
				type: 'tool',
				message: `補助ツールを実行中: ${part.toolName}`,
			});
			continue;
		}

		if (part.type === 'tool-result') {
			await onEvent?.({
				type: 'tool',
				message: `補助ツールが完了: ${part.toolName}`,
			});
			continue;
		}

		if (part.type === 'finish-step') {
			await onEvent?.({
				type: 'status',
				message: `推論ステップ完了: ${part.finishReason}`,
			});
		}
	}

	const planDocument = finalizePlanDocument({
		input: input.plannerInput,
		output: await result.output,
	});

	return planDocument;
};
