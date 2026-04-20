import { cookies } from 'next/headers';
import { z } from 'zod';
import { getOwnedCookSessionSnapshotBySessionId } from '@/lib/cook-runtime/queries';
import { getRequestActor } from '@/lib/create-session';

const routeParamsSchema = z.object({
	sessionId: z.uuid(),
});

export const runtime = 'nodejs';

export async function GET(_: Request, context: { params: Promise<{ sessionId: string }> }) {
	const actor = await getRequestActor(await cookies());

	if (!actor) {
		return Response.json({ message: 'Unauthorized.' }, { status: 401 });
	}

	const params = routeParamsSchema.parse(await context.params);
	const snapshot = await getOwnedCookSessionSnapshotBySessionId(params.sessionId, actor.userId);

	if (!snapshot) {
		return Response.json({ message: 'Cooking session not found.' }, { status: 404 });
	}

	return Response.json({ snapshot });
}
