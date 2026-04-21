import { cookies } from 'next/headers';
import { z } from 'zod';
import { buildCookRuntimeLiveSessionPayload } from '@/lib/cook-runtime/live';
import { getRequestActor } from '@/lib/create-session';
import { getInvalidOriginResponse } from '@/lib/network/same-origin';

const routeParamsSchema = z.object({
	planId: z.uuid(),
});

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
		const payload = await buildCookRuntimeLiveSessionPayload({
			planId: params.planId,
			userId: actor.userId,
		});

		if (!payload.snapshot) {
			return Response.json({ message: 'Not found' }, { status: 404 });
		}

		return Response.json(payload);
	} catch (error) {
		if (error instanceof z.ZodError) {
			return Response.json({ message: 'Invalid live session request.' }, { status: 400 });
		}

		console.error('Failed to build cook live payload.', error);

		return Response.json({ message: 'Failed to build live session.' }, { status: 500 });
	}
}
