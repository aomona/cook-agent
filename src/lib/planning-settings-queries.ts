import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { userPlanningSettings } from '@/db/schema';
import type { PlanningSettings } from '@/lib/planning-settings';
import { createDefaultPlanningSettings, normalizePlanningSettings } from '@/lib/planning-settings';

export type UserPlanningSettingsState = {
	hasSavedSettings: boolean;
	settings: PlanningSettings;
};

export const getUserPlanningSettingsState = async (
	userId: string,
): Promise<UserPlanningSettingsState> => {
	const [savedSettings] = await db
		.select({
			equipment: userPlanningSettings.equipment,
			constraints: userPlanningSettings.constraints,
		})
		.from(userPlanningSettings)
		.where(eq(userPlanningSettings.userId, userId));

	if (!savedSettings) {
		return {
			hasSavedSettings: false,
			settings: createDefaultPlanningSettings(),
		};
	}

	return {
		hasSavedSettings: true,
		settings: normalizePlanningSettings(savedSettings),
	};
};

export const saveUserPlanningSettings = async ({
	settings,
	userId,
}: {
	settings: PlanningSettings;
	userId: string;
}): Promise<UserPlanningSettingsState> => {
	const normalizedSettings = normalizePlanningSettings(settings);

	await db
		.insert(userPlanningSettings)
		.values({
			userId,
			equipment: normalizedSettings.equipment,
			constraints: normalizedSettings.constraints,
		})
		.onConflictDoUpdate({
			target: userPlanningSettings.userId,
			set: {
				equipment: normalizedSettings.equipment,
				constraints: normalizedSettings.constraints,
			},
		});

	return {
		hasSavedSettings: true,
		settings: normalizedSettings,
	};
};
