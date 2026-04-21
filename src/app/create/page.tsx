import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getActiveCreatePlanId, getCreatePlanData, getRequestActor } from '@/lib/create-session';
import { CreatePageClient } from './create-page-client';

export default async function CreatePage() {
	const cookieStore = await cookies();
	const actor = await getRequestActor(cookieStore);

	if (!actor) {
		redirect('/');
	}

	const planId = getActiveCreatePlanId(cookieStore);

	if (!planId) {
		redirect('/create/start');
	}

	const plan = await getCreatePlanData(planId, actor.userId);

	if (!plan) {
		redirect('/create/start');
	}

	if (!plan.requestedServings) {
		redirect('/create/servings');
	}

	return <CreatePageClient initialPlan={plan} />;
}
