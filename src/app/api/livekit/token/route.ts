import { cookies } from 'next/headers';
import { z } from 'zod';
import { buildCookRuntimeLiveSessionPayload } from '@/lib/cook-runtime/live';
import { getRequestActor } from '@/lib/create-session';

const requestSchema = z.object({
	planId: z.uuid(),
});

export const runtime = 'nodejs';

export async function POST(request: Request) {
	const actor = await getRequestActor(await cookies());

	if (!actor) {
		return Response.json({ message: 'Unauthorized.' }, { status: 401 });
	}

	try {
		const payload = requestSchema.parse(await request.json());
		const livePayload = await buildCookRuntimeLiveSessionPayload({
			planId: payload.planId,
			userId: actor.userId,
		});

		if (!livePayload.snapshot) {
			return Response.json({ message: 'Not found' }, { status: 403 });
		}

		return Response.json(livePayload);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to build live session.';

		return Response.json({ message }, { status: 400 });
	}
}