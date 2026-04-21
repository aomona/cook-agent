import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
	activeCreatePlanCookieName,
	getCreatePlanData,
	getRequestActor,
} from '@/lib/create-session';
import { isProduction } from '@/lib/env';
import { getInvalidOriginResponse } from '@/lib/network/same-origin';
import { deleteOwnedPlan } from '@/lib/plans/queries';

export async function GET(_request: Request, context: { params: Promise<{ planId: string }> }) {
	const { planId } = await context.params;
	const cookieStore = await cookies();
	const actor = await getRequestActor(cookieStore);

	if (!actor) {
		return Response.json({ message: 'Unauthorized.' }, { status: 401 });
	}

	const plan = await getCreatePlanData(planId, actor.userId);

	if (!plan) {
		return Response.json({ message: 'Plan not found.' }, { status: 404 });
	}

	return Response.json({ plan });
}

export async function DELETE(request: Request, context: { params: Promise<{ planId: string }> }) {
	const invalidOriginResponse = getInvalidOriginResponse(request);

	if (invalidOriginResponse) {
		return invalidOriginResponse;
	}

	const { planId } = await context.params;
	const cookieStore = await cookies();
	const actor = await getRequestActor(cookieStore);

	if (!actor) {
		return Response.json({ message: 'Unauthorized.' }, { status: 401 });
	}

	const deleted = await deleteOwnedPlan(planId, actor.userId);

	if (!deleted) {
		return Response.json({ message: 'Plan not found.' }, { status: 404 });
	}

	const response = NextResponse.json({ ok: true });

	if (cookieStore.get(activeCreatePlanCookieName)?.value === planId) {
		response.cookies.set(activeCreatePlanCookieName, '', {
			httpOnly: true,
			maxAge: 0,
			path: '/',
			sameSite: 'lax',
			secure: isProduction,
		});
	}

	return response;
}
