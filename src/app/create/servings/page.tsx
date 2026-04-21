import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getActiveCreatePlanId, getCreatePlanData, getRequestActor } from '@/lib/create-session';
import { ServingsPageClient } from './servings-page-client';

export default async function CreateServingsPage() {
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

	return <ServingsPageClient initialPlan={plan} />;
}
