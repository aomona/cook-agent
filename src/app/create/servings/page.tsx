import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getActiveCreatePlanId, getCreatePlanData, getRequestActor } from '@/lib/create-session';
import { CreateStartPrompt } from '../create-start-prompt';
import { ServingsPageClient } from './servings-page-client';

export default async function CreateServingsPage() {
	const cookieStore = await cookies();
	const actor = await getRequestActor(cookieStore);

	if (!actor) {
		redirect('/');
	}

	const planId = getActiveCreatePlanId(cookieStore);

	if (!planId) {
		return (
			<CreateStartPrompt
				description="人数を設定する前に、新しい計画を開始してください。"
				title="編集中の計画が見つかりません"
			/>
		);
	}

	const plan = await getCreatePlanData(planId, actor.userId);

	if (!plan) {
		return (
			<CreateStartPrompt
				description="前回の編集中データを開けませんでした。新しい計画を開始してください。"
				title="編集中の計画を開けませんでした"
			/>
		);
	}

	return <ServingsPageClient initialPlan={plan} />;
}
