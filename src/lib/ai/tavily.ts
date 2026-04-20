import 'server-only';

import { z } from 'zod';
import { getRequiredEnv } from '@/lib/env';
import { assertSafePublicHttpUrl } from '@/lib/network/safe-url';

const tavilyApiKey = getRequiredEnv('TAVILY_API_KEY');
const tavilyBaseUrl = 'https://api.tavily.com';

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

const TAVILY_TIMEOUT_MS = 30000;

const postTavily = async <TSchema extends z.ZodType>({
	path,
	body,
	schema,
}: {
	path: '/search' | '/extract';
	body: Record<string, unknown>;
	schema: TSchema;
}): Promise<z.infer<TSchema>> => {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), TAVILY_TIMEOUT_MS);

	try {
		const response = await fetch(`${tavilyBaseUrl}${path}`, {
			cache: 'no-store',
			method: 'POST',
			headers: {
				Authorization: `Bearer ${tavilyApiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(body),
			signal: controller.signal,
		});

		clearTimeout(timeoutId);

		if (!response.ok) {
			throw new Error(
				`Tavily ${path} failed (${response.status}): ${truncateText(await response.text(), 500)}`,
			);
		}

		return schema.parse(await response.json());
	} catch (error) {
		clearTimeout(timeoutId);

		if (error instanceof Error && error.name === 'AbortError') {
			throw new Error(`Tavily ${path} request timed out after ${TAVILY_TIMEOUT_MS}ms`);
		}

		throw error;
	}
};

export const tavilyWebSearchInputSchema = z.object({
	query: z.string().trim().min(1).max(240),
	reason: z.string().trim().min(1).max(120),
	includeDomains: z.array(z.string().trim().min(1).max(120)).max(10).optional(),
	maxResults: z.number().int().min(1).max(8).optional(),
});

export const tavilyFetchUrlInputSchema = z.object({
	url: z.url(),
	reason: z.string().trim().min(1).max(120),
	query: z.string().trim().min(1).max(240).optional(),
});

export const webSearchWithTavily = async ({
	includeDomains,
	maxResults,
	query,
}: z.infer<typeof tavilyWebSearchInputSchema>) => {
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
};

export const fetchUrlTextWithTavily = async ({
	query,
	url,
}: z.infer<typeof tavilyFetchUrlInputSchema>) => {
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
};