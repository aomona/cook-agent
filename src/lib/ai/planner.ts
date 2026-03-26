import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { createOpenAI } from '@ai-sdk/openai';
import { Output, stepCountIs, ToolLoopAgent, tool } from 'ai';
import { z } from 'zod';
import { getRequiredEnv } from '@/lib/env';
import { planDocumentSchema } from '@/lib/plans/schema';
import type { PlanDocument, PlanGenerationInput } from '@/lib/plans/types';
import { extractHtmlText } from '@/lib/recipes/extract-html-text';

const openai = createOpenAI({
	apiKey: getRequiredEnv('OPENAI_API_KEY'),
});

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

const fetchToolInputSchema = z.object({
	recipeSourceId: z.string().uuid(),
	reason: z.string().trim().min(1).max(120),
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

const fetchReadableText = async (
	url: string,
): Promise<{ text: string; contentType: string | null }> => {
	const safeUrl = await assertSafeUrl(url);
	const response = await fetch(safeUrl, {
		cache: 'no-store',
		headers: {
			'User-Agent': 'cook-agent/0.1 planner',
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch URL (${response.status}).`);
	}

	const contentType = response.headers.get('content-type');
	const body = await response.text();

	if (contentType?.includes('text/html')) {
		return {
			contentType,
			text: extractHtmlText(body),
		};
	}

	if (
		contentType &&
		!contentType.includes('text/plain') &&
		!contentType.includes('application/json') &&
		!contentType.includes('text/markdown')
	) {
		throw new Error('この URL はテキストとして利用できません。');
	}

	return {
		contentType,
		text: body.trim(),
	};
};

const createFetchRecipeSourceTool = (input: PlanGenerationInput) =>
	tool({
		description:
			'Fetch the original recipe page for one of the provided recipe sources when extra context is strictly necessary.',
		inputSchema: fetchToolInputSchema,
		execute: async ({ recipeSourceId }) => {
			const recipe = input.recipes.find(
				(currentRecipe) => currentRecipe.recipeSourceId === recipeSourceId,
			);

			if (!recipe?.sourceUrl) {
				throw new Error('この recipeSourceId に対応する取得可能な URL はありません。');
			}

			const { contentType, text } = await fetchReadableText(recipe.sourceUrl);

			return {
				contentType,
				recipeSourceId,
				text: truncateText(text, 12000),
				url: recipe.sourceUrl,
			};
		},
	});

const buildPrompt = (input: PlanGenerationInput): string =>
	[
		'Build a structured cooking execution plan for a prototype cooking agent.',
		'The primary goal is to finish all dishes at the same time in a realistic kitchen workflow.',
		'First think about the overall flow, then organize work across prep, heating, and assembly lanes.',
		'Use the provided normalized recipes as the primary source of truth.',
		'Do not search the open web.',
		'Use tools only when the recipe data is insufficient and you need to re-read one of the original recipe URLs that was already provided.',
		'Prefer conservative safe assumptions over fetching.',
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

const createPlannerAgent = (input: PlanGenerationInput) =>
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
			'Do not search the open web.',
			'Only fetch original recipe URLs that were already provided, and only when strictly necessary.',
			'Keep the final plan grounded in the provided recipes and constraints.',
		].join(' '),
		tools: {
			fetch_recipe_source: createFetchRecipeSourceTool(input),
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
