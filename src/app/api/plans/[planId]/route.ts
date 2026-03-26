import { cookies } from 'next/headers';
import { getCreatePlanData, getRequestActor } from '@/lib/create-session';

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
