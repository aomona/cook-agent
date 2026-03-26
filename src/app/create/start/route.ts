import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
	activeCreatePlanCookieName,
	createDraftPlan,
	getActiveCreatePlanId,
	getRequestActor,
} from '@/lib/create-session';
import { getOwnedDraftPlan } from '@/lib/plans/queries';

const cookieOptions = {
	httpOnly: true,
	maxAge: 60 * 60 * 24 * 30,
	path: '/',
	sameSite: 'lax' as const,
	secure: process.env.NODE_ENV === 'production',
};

export async function GET(request: Request) {
	const cookieStore = await cookies();
	const actor = await getRequestActor(cookieStore);

	if (!actor) {
		return NextResponse.redirect(new URL('/', request.url));
	}

	const activePlanId = getActiveCreatePlanId(cookieStore);
	const existingDraftPlan = activePlanId
		? await getOwnedDraftPlan(activePlanId, actor.userId)
		: null;
	const draftPlan = existingDraftPlan ?? (await createDraftPlan(actor.userId));
	const response = NextResponse.redirect(new URL('/create', request.url));

	response.cookies.set(activeCreatePlanCookieName, draftPlan.id, cookieOptions);

	return response;
}
