import { z } from 'zod';

export const equipmentList = [
	{ id: 'microwave', label: '電子レンジ', icon: '📡', type: 'boolean' },
	{ id: 'food_processor', label: 'フードプロセッサー', icon: '⚙️', type: 'boolean' },
	{ id: 'stove', label: 'コンロ', icon: '🔥', type: 'count' },
	{ id: 'frying_pan', label: 'フライパン', icon: '🍳', type: 'count' },
	{ id: 'pot', label: '鍋', icon: '🫕', type: 'count' },
	{ id: 'knife', label: '包丁', icon: '🔪', type: 'count' },
	{ id: 'cutting_board', label: 'まな板', icon: '🟫', type: 'count' },
	{ id: 'rice_cooker', label: '炊飯器', icon: '🍚', type: 'count' },
	{ id: 'oven', label: 'オーブン', icon: '🏺', type: 'count' },
	{ id: 'toaster', label: 'トースター', icon: '🍞', type: 'count' },
] as const;

export const dietaryRestrictionList = [
	{ id: 'vegetarian', label: 'ベジタリアン' },
	{ id: 'vegan', label: 'ヴィーガン' },
	{ id: 'gluten_free', label: 'グルテンフリー' },
	{ id: 'halal', label: 'ハラール' },
	{ id: 'low_sodium', label: '減塩' },
] as const;

export type ToggleEquipmentId = Extract<(typeof equipmentList)[number], { type: 'boolean' }>['id'];
export type CountEquipmentId = Extract<(typeof equipmentList)[number], { type: 'count' }>['id'];
export type EquipmentId = CountEquipmentId;
export type DietaryRestrictionId = (typeof dietaryRestrictionList)[number]['id'];

export type EquipmentSettings = Record<CountEquipmentId, number> &
	Record<ToggleEquipmentId, boolean>;

export type ConstraintSettings = {
	maxCookingMinutes: number | null;
	allergens: string;
	dietaryRestrictions: Partial<Record<DietaryRestrictionId, boolean>>;
};

export type PlanningSettings = {
	equipment: EquipmentSettings;
	constraints: ConstraintSettings;
};

export type EquipmentSummaryItem = {
	id: (typeof equipmentList)[number]['id'];
	icon: string;
	label: string;
	count: number;
};

export type PlanningSettingsSummary = {
	equipment: EquipmentSummaryItem[];
	maxCookingMinutes: number | null;
	allergens: string[];
	dietaryRestrictions: string[];
	plannerAvailableEquipment: string[];
	plannerConstraints: string[];
};

const defaultEquipmentSettings: EquipmentSettings = {
	stove: 1,
	frying_pan: 1,
	pot: 1,
	knife: 1,
	cutting_board: 1,
	rice_cooker: 1,
	oven: 0,
	toaster: 0,
	microwave: false,
	food_processor: false,
};

const defaultConstraintSettings: ConstraintSettings = {
	maxCookingMinutes: null,
	allergens: '',
	dietaryRestrictions: {},
};

const coerceCountSetting = (value: unknown): unknown => {
	if (typeof value === 'string' && value.trim() !== '') {
		const parsedValue = Number(value);

		return Number.isNaN(parsedValue) ? value : parsedValue;
	}

	return value;
};

const coerceBooleanSetting = (value: unknown): unknown => {
	if (typeof value === 'number') {
		return value > 0;
	}

	if (typeof value === 'string') {
		const normalizedValue = value.trim().toLowerCase();

		if (['1', 'true', 'yes', 'on'].includes(normalizedValue)) {
			return true;
		}

		if (['0', 'false', 'no', 'off', ''].includes(normalizedValue)) {
			return false;
		}
	}

	return value;
};

const countSettingSchema = (defaultValue: number) =>
	z.preprocess(coerceCountSetting, z.number().int().min(0).max(9).default(defaultValue));

const booleanSettingSchema = (defaultValue: boolean) =>
	z.preprocess(coerceBooleanSetting, z.boolean().default(defaultValue));

const nullableMinutesSchema = z.preprocess((value) => {
	if (value === '') {
		return null;
	}

	if (typeof value === 'string' && value.trim() !== '') {
		const parsedValue = Number(value);

		return Number.isNaN(parsedValue) ? value : parsedValue;
	}

	return value;
}, z
	.number()
	.int()
	.min(10)
	.max(300)
	.nullable()
	.default(defaultConstraintSettings.maxCookingMinutes));

const equipmentSettingsSchema = z.object({
	stove: countSettingSchema(defaultEquipmentSettings.stove),
	frying_pan: countSettingSchema(defaultEquipmentSettings.frying_pan),
	pot: countSettingSchema(defaultEquipmentSettings.pot),
	knife: countSettingSchema(defaultEquipmentSettings.knife),
	cutting_board: countSettingSchema(defaultEquipmentSettings.cutting_board),
	rice_cooker: countSettingSchema(defaultEquipmentSettings.rice_cooker),
	oven: countSettingSchema(defaultEquipmentSettings.oven),
	toaster: countSettingSchema(defaultEquipmentSettings.toaster),
	microwave: booleanSettingSchema(defaultEquipmentSettings.microwave),
	food_processor: booleanSettingSchema(defaultEquipmentSettings.food_processor),
}) satisfies z.ZodType<EquipmentSettings>;

const dietaryRestrictionsSchema = z.object({
	vegetarian: z.boolean().optional(),
	vegan: z.boolean().optional(),
	gluten_free: z.boolean().optional(),
	halal: z.boolean().optional(),
	low_sodium: z.boolean().optional(),
}) satisfies z.ZodType<ConstraintSettings['dietaryRestrictions']>;

const constraintSettingsSchema = z.object({
	maxCookingMinutes: nullableMinutesSchema,
	allergens: z.string().trim().max(300).default(defaultConstraintSettings.allergens),
	dietaryRestrictions: dietaryRestrictionsSchema.default(
		defaultConstraintSettings.dietaryRestrictions,
	),
}) satisfies z.ZodType<ConstraintSettings>;

export const planningSettingsSchema = z.object({
	equipment: equipmentSettingsSchema,
	constraints: constraintSettingsSchema,
}) satisfies z.ZodType<PlanningSettings>;

const asRecord = (value: unknown): Record<string, unknown> =>
	typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

export const createDefaultPlanningSettings = (): PlanningSettings => ({
	equipment: { ...defaultEquipmentSettings },
	constraints: {
		...defaultConstraintSettings,
		dietaryRestrictions: { ...defaultConstraintSettings.dietaryRestrictions },
	},
});

export const normalizePlanningSettings = (value: unknown): PlanningSettings => {
	const root = asRecord(value);
	const equipment = asRecord(root.equipment);
	const constraints = asRecord(root.constraints);
	const dietaryRestrictions = asRecord(constraints.dietaryRestrictions);
	const defaults = createDefaultPlanningSettings();

	return planningSettingsSchema.parse({
		equipment: {
			...defaults.equipment,
			...equipment,
		},
		constraints: {
			...defaults.constraints,
			...constraints,
			dietaryRestrictions: {
				...defaults.constraints.dietaryRestrictions,
				...dietaryRestrictions,
			},
		},
	});
};

export const getEquipmentSummaryItems = (equipment: EquipmentSettings): EquipmentSummaryItem[] => {
	const items: EquipmentSummaryItem[] = [];

	for (const item of equipmentList) {
		if (item.type === 'boolean') {
			if (equipment[item.id]) {
				items.push({
					id: item.id,
					icon: item.icon,
					label: item.label,
					count: 1,
				});
			}

			continue;
		}

		const count = equipment[item.id];

		if (count > 0) {
			items.push({
				id: item.id,
				icon: item.icon,
				label: item.label,
				count,
			});
		}
	}

	return items;
};

export const getDietaryRestrictionLabels = (
	dietaryRestrictions: ConstraintSettings['dietaryRestrictions'],
): string[] =>
	dietaryRestrictionList.filter((item) => dietaryRestrictions[item.id]).map((item) => item.label);

export const parseAllergenList = (value: string): string[] =>
	Array.from(
		new Set(
			value
				.split(/[\n,、]/)
				.map((item) => item.trim())
				.filter(Boolean),
		),
	);

export const buildPlannerAvailableEquipment = (settings: PlanningSettings): string[] =>
	getEquipmentSummaryItems(settings.equipment).map((item) => `${item.label} x${item.count}`);

export const buildPlannerConstraints = (settings: PlanningSettings): string[] => {
	const constraints: string[] = [];

	if (settings.constraints.maxCookingMinutes !== null) {
		constraints.push(`全体の調理時間は${settings.constraints.maxCookingMinutes}分以内を目安にする`);
	}

	const dietaryRestrictions = getDietaryRestrictionLabels(settings.constraints.dietaryRestrictions);

	if (dietaryRestrictions.length > 0) {
		constraints.push(`食事制限: ${dietaryRestrictions.join('、')}`);
	}

	const allergens = parseAllergenList(settings.constraints.allergens);

	if (allergens.length > 0) {
		constraints.push(`避けたい食材・アレルゲン: ${allergens.join('、')}`);
	}

	return constraints;
};

export const getPlanningSettingsSummary = (
	settings: PlanningSettings,
): PlanningSettingsSummary => ({
	equipment: getEquipmentSummaryItems(settings.equipment),
	maxCookingMinutes: settings.constraints.maxCookingMinutes,
	allergens: parseAllergenList(settings.constraints.allergens),
	dietaryRestrictions: getDietaryRestrictionLabels(settings.constraints.dietaryRestrictions),
	plannerAvailableEquipment: buildPlannerAvailableEquipment(settings),
	plannerConstraints: buildPlannerConstraints(settings),
});

export const mergePlannerContext = ({
	availableEquipment,
	constraints,
	settings,
}: {
	availableEquipment: string[];
	constraints: string[];
	settings: PlanningSettings;
}): {
	availableEquipment: string[];
	constraints: string[];
} => ({
	availableEquipment: Array.from(
		new Set([...buildPlannerAvailableEquipment(settings), ...availableEquipment]),
	),
	constraints: Array.from(new Set([...buildPlannerConstraints(settings), ...constraints])),
});
