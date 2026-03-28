import { z } from 'zod';

const encoder = new TextEncoder();

const plannerClientErrorMessages = new Set([
	'Archived plans cannot be generated.',
	'At least one structured recipe is required.',
	'All recipes must be processed before generating a plan.',
	'Plan not found.',
]);

export const plannerRouteRuntime = 'nodejs';
export const plannerRouteMaxDuration = 180;

export const getPlannerRouteErrorResponse = (
	error: unknown,
	fallbackMessage: string,
): { message: string; status: number } => {
	if (error instanceof z.ZodError) {
		return { message: error.issues[0]?.message ?? fallbackMessage, status: 400 };
	}

	if (error instanceof Error) {
		if (error.message === 'Plan not found.') {
			return { message: error.message, status: 404 };
		}

		if (plannerClientErrorMessages.has(error.message)) {
			return { message: error.message, status: 400 };
		}

		return { message: error.message || fallbackMessage, status: 500 };
	}

	return { message: fallbackMessage, status: 500 };
};

export const writeSseEvent = async (
	writer: WritableStreamDefaultWriter<Uint8Array>,
	event: string,
	data: Record<string, unknown>,
): Promise<void> => {
	await writer.write(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
};

export const createSseResponse = (stream: ReadableStream<Uint8Array>): Response =>
	new Response(stream, {
		headers: {
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive',
			'Content-Type': 'text/event-stream; charset=utf-8',
		},
	});
