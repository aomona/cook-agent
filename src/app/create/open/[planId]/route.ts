import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { activeCreatePlanCookieName, getRequestActor } from '@/lib/create-session';
import { isProduction } from '@/lib/env';
import { getInvalidOriginResponse } from '@/lib/network/same-origin';
import { getOwnedDraftPlan } from '@/lib/plans/queries';

const cookieOptions = {
	httpOnly: true,
	maxAge: 60 * 60 * 24 * 30,
	path: '/',
	sameSite: 'lax' as const,
	secure: isProduction,
};

export async function POST(request: Request, context: { params: Promise<{ planId: string }> }) {
	const invalidOriginResponse = getInvalidOriginResponse(request);

	if (invalidOriginResponse) {
		return invalidOriginResponse;
	}

	const cookieStore = await cookies();
	const actor = await getRequestActor(cookieStore);

	if (!actor) {
		return NextResponse.redirect(new URL('/', request.url));
	}

	const { planId } = await context.params;
	const plan = await getOwnedDraftPlan(planId, actor.userId);

	if (!plan) {
		return NextResponse.redirect(new URL(`/plans/${planId}`, request.url));
	}

	const response = NextResponse.redirect(new URL('/create', request.url));
	response.cookies.set(activeCreatePlanCookieName, plan.id, cookieOptions);

	return response;
}
