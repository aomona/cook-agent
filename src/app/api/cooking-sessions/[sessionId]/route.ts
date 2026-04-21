import { cookies } from 'next/headers';
import { z } from 'zod';
import { getOwnedCookSessionSnapshotBySessionId } from '@/lib/cook-runtime/queries';
import { getRequestActor } from '@/lib/create-session';

const routeParamsSchema = z.object({
	sessionId: z.uuid(),
});

const getSessionRouteErrorResponse = (
	error: unknown,
): { message: string; shouldLog?: boolean; status: number } => {
	if (error instanceof z.ZodError) {
		return { message: 'Invalid cooking session identifier.', status: 400 };
	}

	return { message: 'Failed to load cooking session.', shouldLog: true, status: 500 };
};

export const runtime = 'nodejs';

export async function GET(_: Request, context: { params: Promise<{ sessionId: string }> }) {
	const actor = await getRequestActor(await cookies());

	if (!actor) {
		return Response.json({ message: 'Unauthorized.' }, { status: 401 });
	}

	try {
		const params = routeParamsSchema.parse(await context.params);
		const snapshot = await getOwnedCookSessionSnapshotBySessionId(params.sessionId, actor.userId);

		if (!snapshot) {
			return Response.json({ message: 'Cooking session not found.' }, { status: 404 });
		}

		return Response.json({ snapshot });
	} catch (error) {
		const { message, shouldLog, status } = getSessionRouteErrorResponse(error);

		if (shouldLog) {
			console.error(error);
		}

		return Response.json({ message }, { status });
	}
}
