'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { activeCreatePlanCookieName, getRequestActor } from '@/lib/create-session';
import { isProduction } from '@/lib/env';
import { deleteOwnedPlan } from '@/lib/plans/queries';

const deletePlanInputSchema = z.object({
	planId: z.string().uuid(),
});

export const deletePlanAction = async ({ planId }: { planId: string }): Promise<void> => {
	const cookieStore = await cookies();
	const actor = await getRequestActor(cookieStore);

	if (!actor) {
		throw new Error('Unauthorized.');
	}

	const payload = deletePlanInputSchema.parse({ planId });
	const deleted = await deleteOwnedPlan(payload.planId, actor.userId);

	if (!deleted) {
		throw new Error('Plan not found.');
	}

	if (cookieStore.get(activeCreatePlanCookieName)?.value === payload.planId) {
		cookieStore.set(activeCreatePlanCookieName, '', {
			httpOnly: true,
			maxAge: 0,
			path: '/',
			sameSite: 'lax',
			secure: isProduction,
		});
	}

	revalidatePath('/');
	revalidatePath('/create');
	revalidatePath(`/plans/${payload.planId}`);
	revalidatePath(`/plans/${payload.planId}/edit`);
};
