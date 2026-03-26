import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { createOpenAI } from '@ai-sdk/openai';
import { Output, stepCountIs, ToolLoopAgent, tool } from 'ai';
import { z } from 'zod';
import { getRequiredEnv } from '@/lib/env';
import { planDocumentSchema } from '@/lib/plans/schema';
import type { PlanDocument, PlanGenerationInput } from '@/lib/plans/types';

const openai = createOpenAI({
	apiKey: getRequiredEnv('OPENAI_API_KEY'),
});
const tavilyApiKey = getRequiredEnv('TAVILY_API_KEY');
const tavilyBaseUrl = 'https://api.tavily.com';

const plannerOutputSchema = z.object({
	version: z.literal(1),
	title: z.string().trim().min(1).max(160),
	servings: z.number().int().positive().max(100),
	steps: z
		.array(
			z
				.object({
					id: z.string().trim().min(1).max(100),
					title: z.string().trim().min(1).max(120),
					description: z.string().trim().min(1).max(600),
					dependencies: z.array(z.string().trim().min(1).max(100)).max(20),
					estimatedMinutes: z
						.number()
						.int()
						.positive()
						.max(24 * 60),
					canParallelize: z.boolean(),
					recipeSourceId: z.string().uuid().nullable(),
					notesForUser: z.array(z.string().trim().min(1).max(200)).max(10).nullable(),
					recoveryTips: z.array(z.string().trim().min(1).max(200)).max(10).nullable(),
					ingredients: z
						.array(
							z
								.object({
									ingredientId: z.string().trim().min(1).max(120),
									preparation: z.string().trim().min(1).max(120).nullable(),
									quantity: z.string().trim().min(1).max(120).nullable(),
								})
								.strict(),
						)
						.max(20)
						.nullable(),
					outputs: z.array(z.string().trim().min(1).max(120)).max(10).nullable(),
					timers: z
						.array(
							z
								.object({
									id: z.string().trim().min(1).max(100),
									label: z.string().trim().min(1).max(120),
									seconds: z
										.number()
										.int()
										.positive()
										.max(60 * 60 * 12),
									autoStart: z.boolean().nullable(),
								})
								.strict(),
						)
						.max(5)
						.nullable(),
					tags: z.array(z.string().trim().min(1).max(40)).max(10).nullable(),
				})
				.strict(),
		)
		.min(1)
		.max(60),
	metadata: z
		.object({
			availableEquipment: z.array(z.string().trim().min(1).max(80)).max(30),
			constraints: z.array(z.string().trim().min(1).max(160)).max(30),
			recipeSourceIds: z.array(z.string().uuid()).max(20),
		})
		.strict()
		.nullable(),
});

const plannerOutput = Output.object({
	schema: plannerOutputSchema,
	name: 'cooking_plan',
	description: 'Structured cooking execution plan for a multi-step meal workflow.',
});

const webSearchToolInputSchema = z.object({
	query: z.string().trim().min(1).max(240),
	reason: z.string().trim().min(1).max(120),
	includeDomains: z.array(z.string().trim().min(1).max(120)).max(10).optional(),
	maxResults: z.number().int().min(1).max(8).optional(),
});

const fetchUrlToolInputSchema = z.object({
	url: z.string().url(),
	reason: z.string().trim().min(1).max(120),
	query: z.string().trim().min(1).max(240).optional(),
});

const tavilySearchResultSchema = z.object({
	title: z.string().catch(''),
	url: z.string().url(),
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
	url: z.string().url(),
	raw_content: z.string(),
});

const tavilyExtractResponseSchema = z.object({
	results: z.array(tavilyExtractResultSchema),
	request_id: z.string().optional(),
});

const truncateText = (value: string, maxLength: number): string =>
	value.length <= maxLength ? value : value.slice(0, maxLength);

const isPrivateIpv4 = (address: string): boolean => {
	const octets = address.split('.').map((segment) => Number.parseInt(segment, 10));

	if (octets.length !== 4 || octets.some((octet) => Number.isNaN(octet))) {
		return true;
	}

	if (octets[0] === 10 || octets[0] === 127) {
		return true;
	}

	if (octets[0] === 169 && octets[1] === 254) {
		return true;
	}

	if (octets[0] === 192 && octets[1] === 168) {
		return true;
	}

	return octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31;
};

const isPrivateIpv6 = (address: string): boolean => {
	const normalizedAddress = address.toLowerCase();

	if (normalizedAddress === '::1') {
		return true;
	}

	if (normalizedAddress.startsWith('::ffff:')) {
		return isPrivateIpAddress(normalizedAddress.slice(7));
	}

	if (normalizedAddress.startsWith('fc') || normalizedAddress.startsWith('fd')) {
		return true;
	}

	return (
		normalizedAddress.startsWith('fe8') ||
		normalizedAddress.startsWith('fe9') ||
		normalizedAddress.startsWith('fea') ||
		normalizedAddress.startsWith('feb')
	);
};

const isPrivateIpAddress = (address: string): boolean => {
	const ipVersion = isIP(address);

	if (ipVersion === 4) {
		return isPrivateIpv4(address);
	}

	if (ipVersion === 6) {
		return isPrivateIpv6(address);
	}

	return true;
};

const assertSafeUrl = async (value: string): Promise<URL> => {
	const url = new URL(value);

	if (!['http:', 'https:'].includes(url.protocol)) {
		throw new Error('HTTP または HTTPS の URL のみ取得できます。');
	}

	const hostname = url.hostname.toLowerCase();

	if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
		throw new Error('この URL は取得できません。');
	}

	if (isIP(hostname) !== 0) {
		if (isPrivateIpAddress(hostname)) {
			throw new Error('この URL は取得できません。');
		}

		return url;
	}

	const addresses = await lookup(hostname, { all: true, verbatim: true });

	if (addresses.some(({ address }) => isPrivateIpAddress(address))) {
		throw new Error('この URL は取得できません。');
	}

	return url;
};

const postTavily = async <TSchema extends z.ZodTypeAny>({
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
			const safeUrl = await assertSafeUrl(url);
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
		'Respect available equipment and listed constraints. Never assume unavailable equipment.',
		'Important rules:',
		'- Output must be JSON only.',
		'- Do not output explanations or Markdown.',
		'- Follow the provided schema strictly.',
		'- Do not copy recipe instructions verbatim; decompose them into executable kitchen tasks.',
		'- Prefer more fine-grained tasks over coarse summaries.',
		'- Prefer task durations of 2 to 6 minutes when practical.',
		'- Split combined recipe instructions into multiple tasks whenever that improves execution clarity.',
		'- Prefer roughly 14 to 40 steps unless the meal is genuinely simple.',
		'- Do not omit fields required by the schema; use null when a nullable field has no value.',
		'- Use canParallelize=true for work that can proceed in parallel without violating dependencies.',
		'- Express all ordering constraints explicitly in dependencies.',
		'- Put safety-critical guidance in notesForUser or recoveryTips.',
		'- The goal is completing the meal, not writing polished prose.',
		'- If information is missing, choose the most conservative safe assumption.',
		'Planning policy:',
		'- Think through the full meal flow before writing steps.',
		'- Break long prep, heating, and finishing work into smaller executable units.',
		'- Reduce idle time by parallelizing safe work.',
		'- Fill waiting time with other work when possible.',
		'- Avoid overloading the final minutes before serving.',
		'- Add timers wherever they materially help execution.',
		'Field guidance:',
		'- Use exactly these JSON field names: version, title, servings, steps, id, title, description, dependencies, estimatedMinutes, canParallelize, recipeSourceId, notesForUser, recoveryTips, ingredients, outputs, timers, tags, metadata.',
		'- dependencies must contain only earlier step IDs.',
		'- canParallelize should be false unless the step can truly overlap with other pending work.',
		'- When you reference ingredients in a step, use ingredient IDs from the corresponding recipe.',
		'- Use recipeSourceId whenever a step clearly comes from one recipe.',
		'- Timer durations must be in seconds.',
		'- For nullable fields with no value, return null instead of omitting the key.',
		'- metadata should be either null or an object with availableEquipment, constraints, and recipeSourceIds.',
		'',
		JSON.stringify(input, null, 2),
	].join('\n');

export type PlannerStreamEvent =
	| { type: 'status'; message: string }
	| { type: 'reasoning'; delta: string }
	| { type: 'tool'; message: string };

const createPlannerAgent = (_input: PlanGenerationInput) =>
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
			'Think carefully about ordering, parallelism, timing, and failure recovery.',
			'Use Tavily web tools only when missing information blocks a better plan.',
			'Prefer the provided normalized recipes over web results whenever they are sufficient.',
			'Keep the final plan grounded in the provided recipes and constraints.',
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
	const plannerAgent = createPlannerAgent(input);

	const result = await plannerAgent.generate({
		prompt: buildPrompt(input),
	});

	return planDocumentSchema.parse(result.output);
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
	const plannerAgent = createPlannerAgent(input);
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

	const planDocument = await result.output;

	return planDocumentSchema.parse(planDocument);
};
