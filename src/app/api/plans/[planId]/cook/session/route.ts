import { cookies } from 'next/headers';
import { z } from 'zod';
import { startCookingSession } from '@/lib/cook-runtime/actions';
import { getOwnedCookSessionSnapshotByPlanId } from '@/lib/cook-runtime/queries';
import { getRequestActor } from '@/lib/create-session';

const routeParamsSchema = z.object({
	planId: z.uuid(),
});

export const runtime = 'nodejs';

export async function GET(_: Request, context: { params: Promise<{ planId: string }> }) {
	const actor = await getRequestActor(await cookies());

	if (!actor) {
		return Response.json({ message: 'Unauthorized.' }, { status: 401 });
	}

	const params = routeParamsSchema.parse(await context.params);
	const snapshot = await getOwnedCookSessionSnapshotByPlanId(params.planId, actor.userId);

	if (!snapshot) {
		return Response.json({ message: 'Cook session context not found.' }, { status: 404 });
	}

	return Response.json({ snapshot });
}

export async function POST(_: Request, context: { params: Promise<{ planId: string }> }) {
	const actor = await getRequestActor(await cookies());

	if (!actor) {
		return Response.json({ message: 'Unauthorized.' }, { status: 401 });
	}

	const params = routeParamsSchema.parse(await context.params);
	const snapshot = await startCookingSession({
		planId: params.planId,
		userId: actor.userId,
	});

	return Response.json({ snapshot });
}
