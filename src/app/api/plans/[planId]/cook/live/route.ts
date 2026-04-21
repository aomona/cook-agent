import { cookies } from 'next/headers';
import { z } from 'zod';
import { buildCookRuntimeLiveSessionPayload } from '@/lib/cook-runtime/live';
import { getRequestActor } from '@/lib/create-session';

const routeParamsSchema = z.object({
	planId: z.uuid(),
});

export const runtime = 'nodejs';

export async function POST(_: Request, context: { params: Promise<{ planId: string }> }) {
	const actor = await getRequestActor(await cookies());

	if (!actor) {
		return Response.json({ message: 'Unauthorized.' }, { status: 401 });
	}

	try {
		const params = routeParamsSchema.parse(await context.params);
		const payload = await buildCookRuntimeLiveSessionPayload({
			planId: params.planId,
			userId: actor.userId,
		});

		if (!payload.snapshot) {
			return Response.json({ message: 'Not found' }, { status: 404 });
		}

		return Response.json(payload);
	} catch (error) {
		console.error('Failed to build cook live payload.', error);
		const message = error instanceof Error ? error.message : 'Failed to build live session.';

		return Response.json({ message }, { status: 400 });
	}
}
