import { cookies } from 'next/headers';
import { z } from 'zod';
import { getRequestActor } from '@/lib/create-session';
import { planningSettingsSchema } from '@/lib/planning-settings';
import {
	getUserPlanningSettingsState,
	saveUserPlanningSettings,
} from '@/lib/planning-settings-queries';
import { invalidateAdjustedRecipesForUser } from '@/lib/recipes/adjust-plan-recipes';

const planningSettingsRequestSchema = z.object({
	settings: planningSettingsSchema,
});

export async function GET() {
	const cookieStore = await cookies();
	const actor = await getRequestActor(cookieStore);

	if (!actor) {
		return Response.json({ message: 'Unauthorized.' }, { status: 401 });
	}

	const payload = await getUserPlanningSettingsState(actor.userId);

	return Response.json(payload);
}

export async function PUT(request: Request) {
	const cookieStore = await cookies();
	const actor = await getRequestActor(cookieStore);

	if (!actor) {
		return Response.json({ message: 'Unauthorized.' }, { status: 401 });
	}

	try {
		const { settings } = planningSettingsRequestSchema.parse(await request.json());
		const payload = await saveUserPlanningSettings({
			settings,
			userId: actor.userId,
		});
		await invalidateAdjustedRecipesForUser(actor.userId);

		return Response.json(payload);
	} catch (error) {
		if (error instanceof z.ZodError) {
			return Response.json({ message: 'Invalid planning settings.' }, { status: 400 });
		}

		console.error(error);

		return Response.json({ message: 'Failed to save planning settings.' }, { status: 500 });
	}
}
