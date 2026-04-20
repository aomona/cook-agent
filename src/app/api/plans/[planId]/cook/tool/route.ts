import { cookies } from 'next/headers';
import { z } from 'zod';
import { executeCookRuntimeTool } from '@/lib/cook-runtime/live';
import { getRequestActor } from '@/lib/create-session';

const routeParamsSchema = z.object({
	planId: z.uuid(),
});

const toolRequestSchema = z.object({
	toolName: z.string().trim().min(1).max(120),
	args: z.unknown(),
	sessionId: z.uuid().optional(),
});

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ planId: string }> }) {
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
			toolName: payload.toolName as Parameters<typeof executeCookRuntimeTool>[0]['toolName'],
			userId: actor.userId,
		});

		return Response.json({ result });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to execute tool.';

		return Response.json({ message }, { status: 400 });
	}
}
