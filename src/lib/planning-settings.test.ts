import { describe, expect, test } from 'vitest';
import {
	createDefaultPlanningSettings,
	getPlanningSettingsSummary,
	mergePlannerContext,
	normalizePlanningSettings,
	planningSettingsSchema,
} from '@/lib/planning-settings';

describe('normalizePlanningSettings', () => {
	test('fills missing fields with defaults', () => {
		const settings = normalizePlanningSettings({
			constraints: {
				allergens: '卵',
			},
		});

		expect(settings.equipment.frying_pan).toBe(1);
		expect(settings.equipment.stove).toBe(1);
		expect(settings.equipment.oven).toBe(0);
		expect(settings.equipment.food_processor).toBe(false);
		expect(settings.constraints.maxCookingMinutes).toBeNull();
		expect(settings.constraints.allergens).toBe('卵');
	});

	test('accepts legacy saved values for food processor and missing stove', () => {
		const settings = normalizePlanningSettings({
			equipment: {
				food_processor: 1,
				frying_pan: 2,
			},
			constraints: {},
		});

		expect(settings.equipment.food_processor).toBe(true);
		expect(settings.equipment.stove).toBe(1);
		expect(settings.equipment.frying_pan).toBe(2);
	});
});

describe('planningSettingsSchema', () => {
	test('parses legacy plan metadata snapshots', () => {
		const settings = planningSettingsSchema.parse({
			equipment: {
				food_processor: 0,
				frying_pan: 2,
				pot: 1,
				knife: 1,
				cutting_board: 1,
				rice_cooker: 1,
				oven: 0,
				toaster: 0,
				microwave: false,
			},
			constraints: {
				allergens: '',
				dietaryRestrictions: {},
				maxCookingMinutes: null,
			},
		});

		expect(settings.equipment.food_processor).toBe(false);
		expect(settings.equipment.stove).toBe(1);
	});
});

describe('getPlanningSettingsSummary', () => {
	test('normalizes dietary restrictions and allergens for display', () => {
		const settings = createDefaultPlanningSettings();
		settings.constraints.dietaryRestrictions.vegetarian = true;
		settings.constraints.allergens = '卵、 小麦\nえび';

		const summary = getPlanningSettingsSummary(settings);

		expect(summary.dietaryRestrictions).toEqual(['ベジタリアン']);
		expect(summary.allergens).toEqual(['卵', '小麦', 'えび']);
	});
});

describe('mergePlannerContext', () => {
	test('keeps structured equipment counts and constraint summaries', () => {
		const settings = createDefaultPlanningSettings();
		settings.equipment.stove = 2;
		settings.equipment.frying_pan = 2;
		settings.equipment.oven = 1;
		settings.equipment.food_processor = true;
		settings.constraints.maxCookingMinutes = 45;
		settings.constraints.dietaryRestrictions.vegetarian = true;
		settings.constraints.allergens = '卵, 小麦';

		const result = mergePlannerContext({
			availableEquipment: ['ボウル'],
			constraints: ['洗い物を少なく'],
			settings,
		});

		expect(result.availableEquipment).toContain('コンロ x2');
		expect(result.availableEquipment).toContain('フライパン x2');
		expect(result.availableEquipment).toContain('オーブン x1');
		expect(result.availableEquipment).toContain('フードプロセッサー x1');
		expect(result.availableEquipment).toContain('ボウル');
		expect(result.constraints).toContain('全体の調理時間は45分以内を目安にする');
		expect(result.constraints).toContain('食事制限: ベジタリアン');
		expect(result.constraints).toContain('避けたい食材・アレルゲン: 卵、小麦');
		expect(result.constraints).toContain('洗い物を少なく');
	});
});
