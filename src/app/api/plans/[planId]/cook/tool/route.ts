import { cookies } from 'next/headers';
import { z } from 'zod';
import { cookRuntimeToolNames, executeCookRuntimeTool } from '@/lib/cook-runtime/live';
import { getRequestActor } from '@/lib/create-session';
import { getInvalidOriginResponse } from '@/lib/network/same-origin';

const routeParamsSchema = z.object({
	planId: z.uuid(),
});

const toolRequestSchema = z.object({
	toolName: z.enum(cookRuntimeToolNames),
	args: z.unknown(),
	sessionId: z.uuid().optional(),
});

const notFoundMessages = new Set([
	'Plan not found.',
	'Active plan not found.',
	'Cooking session not found.',
	'Cook session context not found.',
	'Step not found.',
	'Timer not found.',
]);

const badRequestMessages = new Set([
	'Active cooking session not found.',
	'Current cooking step not found.',
	'Session does not belong to the requested plan.',
	'Cooking session is not in an allowed state.',
	'Timer must be running to pause.',
	'Timer is no longer running.',
	'Timer must be paused to resume.',
	'Timer is no longer paused.',
	'Timer is already cancelled.',
]);

const getToolErrorResponse = (error: unknown): { message: string; status: number } => {
	if (error instanceof z.ZodError) {
		return { message: error.issues[0]?.message ?? 'Invalid tool request.', status: 400 };
	}

	if (error instanceof Error) {
		if (notFoundMessages.has(error.message)) {
			return { message: error.message, status: 404 };
		}

		if (badRequestMessages.has(error.message) || error.message.startsWith('Unsupported tool:')) {
			return { message: error.message, status: 400 };
		}

		return { message: 'Failed to execute tool.', status: 500 };
	}

	return { message: 'Failed to execute tool.', status: 500 };
};

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ planId: string }> }) {
	const invalidOriginResponse = getInvalidOriginResponse(request);

	if (invalidOriginResponse) {
		return invalidOriginResponse;
	}

	const actor = await getRequestActor(await cookies());

	if (!actor) {
		return Response.json({ message: 'Unauthorized.' }, { status: 401 });
	}

	try {
		const params = routeParamsSchema.parse(await context.params);
		const payload = toolRequestSchema.parse(await request.json());
		const result = await executeCookRuntimeTool({
			args: payload.args,
			planId: params.planId,
			sessionId: payload.sessionId,
			toolName: payload.toolName,
			userId: actor.userId,
		});

		return Response.json({ result });
	} catch (error) {
		const { message, status } = getToolErrorResponse(error);

		if (status >= 500) {
			console.error('Failed to execute cook runtime tool.', error);
		}

		return Response.json({ message }, { status });
	}
}
