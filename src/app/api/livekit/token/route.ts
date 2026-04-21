import { cookies } from 'next/headers';
import { z } from 'zod';
import { buildCookRuntimeLiveSessionPayload } from '@/lib/cook-runtime/live';
import { getRequestActor } from '@/lib/create-session';
import { getInvalidOriginResponse } from '@/lib/network/same-origin';

const requestSchema = z.object({
	planId: z.uuid(),
});

export const runtime = 'nodejs';

export async function POST(request: Request) {
	const invalidOriginResponse = getInvalidOriginResponse(request);

	if (invalidOriginResponse) {
		return invalidOriginResponse;
	}

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
			return Response.json({ message: 'Plan not found.' }, { status: 404 });
		}

		return Response.json(livePayload);
	} catch (error) {
		if (error instanceof z.ZodError) {
			return Response.json({ message: 'Invalid live session request.' }, { status: 400 });
		}

		console.error('Failed to build live session payload.', error);

		return Response.json({ message: 'Failed to build live session.' }, { status: 500 });
	}
}
