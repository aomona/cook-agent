'use client';

import {
	Box,
	Button,
	Checkbox,
	DrawerBody,
	DrawerCloseButton,
	DrawerContent,
	DrawerFooter,
	DrawerHeader,
	DrawerOverlay,
	DrawerRoot,
	Flex,
	Heading,
	NumberInput,
	Separator,
	TabsList,
	TabsPanel,
	TabsPanels,
	TabsRoot,
	TabsTab,
	Text,
	Textarea,
	VStack,
} from '@workspaces/ui';
import { useEffect, useState } from 'react';

const EQUIPMENT_LIST = [
	{ id: 'frying_pan', label: 'フライパン', icon: '🍳' },
	{ id: 'pot', label: '鍋', icon: '🫕' },
	{ id: 'knife', label: '包丁', icon: '🔪' },
	{ id: 'cutting_board', label: 'まな板', icon: '🟫' },
	{ id: 'rice_cooker', label: '炊飯器', icon: '🍚' },
	{ id: 'oven', label: 'オーブン', icon: '🏺' },
	{ id: 'food_processor', label: 'フードプロセッサー', icon: '⚙️' },
	{ id: 'toaster', label: 'トースター', icon: '🍞' },
] as const;

const DIETARY_RESTRICTIONS = [
	{ id: 'vegetarian', label: 'ベジタリアン' },
	{ id: 'vegan', label: 'ヴィーガン' },
	{ id: 'gluten_free', label: 'グルテンフリー' },
	{ id: 'halal', label: 'ハラール' },
	{ id: 'low_sodium', label: '減塩' },
] as const;

type EquipmentId = (typeof EQUIPMENT_LIST)[number]['id'];
type DietaryId = (typeof DIETARY_RESTRICTIONS)[number]['id'];

type EquipmentSettings = Record<EquipmentId, number> & { microwave: boolean };
type ConstraintSettings = {
	maxCookingMinutes: number;
	allergens: string;
	dietaryRestrictions: Partial<Record<DietaryId, boolean>>;
};

const STORAGE_KEY_EQUIPMENT = 'cook-agent-equipment';
const STORAGE_KEY_CONSTRAINTS = 'cook-agent-constraints';

const DEFAULT_EQUIPMENT: EquipmentSettings = {
	frying_pan: 1,
	pot: 1,
	knife: 1,
	cutting_board: 1,
	rice_cooker: 1,
	oven: 0,
	food_processor: 0,
	toaster: 0,
	microwave: false,
};

const DEFAULT_CONSTRAINTS: ConstraintSettings = {
	maxCookingMinutes: 60,
	allergens: '',
	dietaryRestrictions: {},
};

function loadFromStorage<T>(key: string, fallback: T): T {
	if (typeof window === 'undefined') return fallback;
	try {
		const raw = localStorage.getItem(key);
		return raw ? (JSON.parse(raw) as T) : fallback;
	} catch {
		return fallback;
	}
}

function saveToStorage(key: string, value: unknown) {
	if (typeof window === 'undefined') return;
	localStorage.setItem(key, JSON.stringify(value));
}

type Props = {
	open: boolean;
	onClose: () => void;
};

export const SettingsDrawer = ({ open, onClose }: Props) => {
	const [equipment, setEquipment] = useState<EquipmentSettings>(DEFAULT_EQUIPMENT);
	const [constraints, setConstraints] = useState<ConstraintSettings>(DEFAULT_CONSTRAINTS);

	useEffect(() => {
		setEquipment(loadFromStorage(STORAGE_KEY_EQUIPMENT, DEFAULT_EQUIPMENT));
		setConstraints(loadFromStorage(STORAGE_KEY_CONSTRAINTS, DEFAULT_CONSTRAINTS));
	}, []);

	const handleSave = () => {
		saveToStorage(STORAGE_KEY_EQUIPMENT, equipment);
		saveToStorage(STORAGE_KEY_CONSTRAINTS, constraints);
		onClose();
	};

	const setEquipmentCount = (id: EquipmentId, value: number) => {
		setEquipment((prev) => ({ ...prev, [id]: value }));
	};

	return (
		<DrawerRoot open={open} onClose={onClose}>
			<DrawerOverlay />
			<DrawerContent>
				<DrawerCloseButton />
				<DrawerHeader borderBottomWidth="1px" borderColor="border.muted" pb="md">
					<Heading size="md">設定</Heading>
				</DrawerHeader>

				<DrawerBody p={0}>
					<TabsRoot variant="line" size="sm">
						<TabsList px="md" pt="sm">
							<TabsTab index={0}>利用可能な器具</TabsTab>
							<TabsTab index={1}>制約条件</TabsTab>
						</TabsList>

						<TabsPanels>
							{/* Equipment Tab */}
							<TabsPanel index={0} px="md" py="lg">
								<VStack align="stretch" gap="sm">
									{/* Microwave — checkbox */}
									<Box
										borderWidth="1px"
										borderColor="border.muted"
										borderRadius="md"
										px="md"
										py="sm"
									>
										<Checkbox
											checked={equipment.microwave}
											onChange={(e) =>
												setEquipment((prev) => ({
													...prev,
													microwave: e.target.checked,
												}))
											}
										>
											<Flex align="center" gap="xs">
												<Text fontSize="lg" lineHeight={1}>
													📡
												</Text>
												<Text fontWeight="medium">電子レンジ</Text>
											</Flex>
										</Checkbox>
									</Box>

									<Separator />

									{/* Number-input equipment */}
									{EQUIPMENT_LIST.map((item) => (
										<Flex
											key={item.id}
											align="center"
											justify="space-between"
											borderWidth="1px"
											borderColor="border.muted"
											borderRadius="md"
											px="md"
											py="sm"
										>
											<Flex align="center" gap="sm">
												<Text fontSize="lg" lineHeight={1}>
													{item.icon}
												</Text>
												<Text fontWeight="medium">{item.label}</Text>
											</Flex>
											<NumberInput
												value={equipment[item.id]}
												onChange={(_s, v) => setEquipmentCount(item.id, v)}
												min={0}
												max={9}
												w="80px"
												size="sm"
												allowMouseWheel
											/>
										</Flex>
									))}
								</VStack>
							</TabsPanel>

							{/* Constraints Tab */}
							<TabsPanel index={1} px="md" py="lg">
								<VStack align="stretch" gap="lg">
									{/* Max cooking time */}
									<VStack align="stretch" gap="xs">
										<Text fontWeight="semibold" fontSize="sm">
											調理時間の目安（分）
										</Text>
										<NumberInput
											value={constraints.maxCookingMinutes}
											onChange={(_s, v) =>
												setConstraints((prev) => ({ ...prev, maxCookingMinutes: v }))
											}
											min={10}
											max={300}
											step={10}
											w="120px"
										/>
										<Text fontSize="xs" color="fg.subtle">
											目安となる最大調理時間を設定します
										</Text>
									</VStack>

									<Separator />

									{/* Dietary restrictions */}
									<VStack align="stretch" gap="sm">
										<Text fontWeight="semibold" fontSize="sm">
											食事制限
										</Text>
										{DIETARY_RESTRICTIONS.map((r) => (
											<Checkbox
												key={r.id}
												checked={constraints.dietaryRestrictions[r.id] ?? false}
												onChange={(e) =>
													setConstraints((prev) => ({
														...prev,
														dietaryRestrictions: {
															...prev.dietaryRestrictions,
															[r.id]: e.target.checked,
														},
													}))
												}
											>
												{r.label}
											</Checkbox>
										))}
									</VStack>

									<Separator />

									{/* Allergens */}
									<VStack align="stretch" gap="xs">
										<Text fontWeight="semibold" fontSize="sm">
											避けたい食材・アレルゲン
										</Text>
										<Textarea
											value={constraints.allergens}
											onChange={(e) =>
												setConstraints((prev) => ({
													...prev,
													allergens: e.target.value,
												}))
											}
											placeholder="例: 卵、小麦、えび"
											rows={3}
											resize="none"
										/>
										<Text fontSize="xs" color="fg.subtle">
											カンマ区切りで入力してください
										</Text>
									</VStack>
								</VStack>
							</TabsPanel>
						</TabsPanels>
					</TabsRoot>
				</DrawerBody>

				<DrawerFooter borderTopWidth="1px" borderColor="border.muted" gap="sm">
					<Button variant="ghost" onClick={onClose}>
						キャンセル
					</Button>
					<Button variant="solid" onClick={handleSave}>
						保存
					</Button>
				</DrawerFooter>
			</DrawerContent>
		</DrawerRoot>
	);
};
