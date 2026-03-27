'use client';

import {
	Badge,
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
import { useEffect, useMemo, useState } from 'react';
import {
	createDefaultPlanningSettings,
	type DietaryRestrictionId,
	dietaryRestrictionList,
	type EquipmentId,
	equipmentList,
	getPlanningSettingsSummary,
	type PlanningSettings,
	type ToggleEquipmentId,
} from '@/lib/planning-settings';

type Props = {
	hasSavedSettings: boolean;
	isSaving: boolean;
	onClose: () => void;
	onSave: (settings: PlanningSettings) => Promise<void>;
	open: boolean;
	settings: PlanningSettings;
};

const getSafeCount = (value: number): number => {
	if (!Number.isFinite(value)) {
		return 0;
	}

	return Math.min(9, Math.max(0, Math.round(value)));
};

const getSafeTime = (value: number): number => {
	if (!Number.isFinite(value)) {
		return 60;
	}

	return Math.min(300, Math.max(10, Math.round(value / 10) * 10));
};

export const SettingsDrawer = ({
	hasSavedSettings,
	isSaving,
	onClose,
	onSave,
	open,
	settings,
}: Props) => {
	const [draft, setDraft] = useState<PlanningSettings>(settings);
	const [saveError, setSaveError] = useState<string | null>(null);

	useEffect(() => {
		if (!open) {
			return;
		}

		setDraft(settings);
		setSaveError(null);
	}, [open, settings]);

	const summary = useMemo(() => getPlanningSettingsSummary(draft), [draft]);
	const isDirty = useMemo(
		() => JSON.stringify(draft) !== JSON.stringify(settings),
		[draft, settings],
	);

	const setEquipmentCount = (id: EquipmentId, value: number) => {
		setDraft((current) => ({
			...current,
			equipment: {
				...current.equipment,
				[id]: getSafeCount(value),
			},
		}));
	};

	const setEquipmentToggle = (id: ToggleEquipmentId, checked: boolean) => {
		setDraft((current) => ({
			...current,
			equipment: {
				...current.equipment,
				[id]: checked,
			},
		}));
	};

	const setDietaryRestriction = (id: DietaryRestrictionId, checked: boolean) => {
		setDraft((current) => ({
			...current,
			constraints: {
				...current.constraints,
				dietaryRestrictions: {
					...current.constraints.dietaryRestrictions,
					[id]: checked,
				},
			},
		}));
	};

	const handleSave = async (): Promise<void> => {
		setSaveError(null);

		try {
			await onSave(draft);
		} catch (error) {
			setSaveError(
				error instanceof Error && error.message ? error.message : '設定の保存に失敗しました。',
			);
		}
	};

	return (
		<DrawerRoot open={open} onClose={onClose}>
			<DrawerOverlay />
			<DrawerContent>
				<DrawerCloseButton />
				<DrawerHeader borderBottomWidth="1px" borderColor="border.muted" pb="md">
					<VStack align="stretch" gap="sm" pr="xl">
						<VStack align="stretch" gap="xs">
							<Heading size="md">工程生成の設定</Heading>
							<Text color="fg.subtle">
								器具の数や制約条件をここで決めておくと、次回以降の plan 生成にも同じ前提を使えます。
							</Text>
						</VStack>
						<Flex gap="sm" wrap="wrap">
							<Badge colorScheme={hasSavedSettings ? 'green' : 'blackAlpha'} variant="subtle">
								{hasSavedSettings ? 'アカウントに保存済み' : 'まだ保存されていません'}
							</Badge>
							<Badge colorScheme="blue" variant="subtle">
								器具 {summary.equipment.length} 件
							</Badge>
							<Badge
								colorScheme={summary.maxCookingMinutes ? 'orange' : 'blackAlpha'}
								variant="subtle"
							>
								{summary.maxCookingMinutes
									? `目安 ${summary.maxCookingMinutes}分以内`
									: '時間制約なし'}
							</Badge>
						</Flex>
					</VStack>
				</DrawerHeader>

				<DrawerBody p={0}>
					<VStack align="stretch" gap={0}>
						<Box
							bg="linear-gradient(135deg, rgba(249, 250, 251, 0.96), rgba(220, 252, 231, 0.9))"
							borderBottomWidth="1px"
							borderColor="green.100"
							px="md"
							py="md"
						>
							<VStack align="stretch" gap="sm">
								<Text fontSize="sm" fontWeight="semibold">
									この設定が工程生成に反映されます
								</Text>
								<Flex gap="sm" wrap="wrap">
									{summary.equipment.map((item) => (
										<Badge key={item.id} colorScheme="green" variant="subtle">
											{item.icon} {item.label} x{item.count}
										</Badge>
									))}
									{summary.dietaryRestrictions.map((item) => (
										<Badge key={item} colorScheme="teal" variant="subtle">
											{item}
										</Badge>
									))}
									{summary.allergens.map((item) => (
										<Badge key={item} colorScheme="red" variant="subtle">
											{item}
										</Badge>
									))}
								</Flex>
								<Text color="fg.subtle" fontSize="xs">
									保存すると generate / improve の両方で同じ条件を使います。
								</Text>
							</VStack>
						</Box>

						<TabsRoot variant="line" size="sm">
							<TabsList px="md" pt="sm">
								<TabsTab index={0}>利用可能な器具</TabsTab>
								<TabsTab index={1}>制約条件</TabsTab>
							</TabsList>

							<TabsPanels>
								<TabsPanel index={0} px="md" py="lg">
									<VStack align="stretch" gap="sm">
										<Text color="fg.subtle" fontSize="sm">
											利用できる数を正確にしておくと、同時進行や洗い物の段取りが安定します。
										</Text>

										{equipmentList.map((item) =>
											item.type === 'boolean' ? (
												<Flex
													key={item.id}
													align="center"
													justify="space-between"
													borderWidth="1px"
													borderColor="border.muted"
													borderRadius="lg"
													px="md"
													py="sm"
												>
													<Flex align="center" gap="xs">
														<Text fontSize="lg" lineHeight={1}>
															{item.icon}
														</Text>
														<Text fontWeight="medium">{item.label}</Text>
													</Flex>
													<Checkbox
														aria-label={item.label}
														checked={draft.equipment[item.id]}
														onChange={(event) => setEquipmentToggle(item.id, event.target.checked)}
													/>
												</Flex>
											) : (
												<Flex
													key={item.id}
													align="center"
													gap="md"
													borderWidth="1px"
													borderColor="border.muted"
													borderRadius="lg"
													px="md"
													py="sm"
												>
													<Flex align="center" flex="1" gap="sm" minW={0}>
														<Text fontSize="lg" lineHeight={1}>
															{item.icon}
														</Text>
														<Text fontWeight="medium">{item.label}</Text>
													</Flex>
													<Flex flexShrink={0} justify="end" minW="112px">
														<NumberInput
															allowMouseWheel
															max={9}
															min={0}
															onChange={(_valueAsString, valueAsNumber) =>
																setEquipmentCount(item.id, valueAsNumber)
															}
															size="sm"
															value={draft.equipment[item.id]}
															w="112px"
														/>
													</Flex>
												</Flex>
											),
										)}
									</VStack>
								</TabsPanel>

								<TabsPanel index={1} px="md" py="lg">
									<VStack align="stretch" gap="lg">
										<VStack align="stretch" gap="sm">
											<Flex align="center" justify="space-between" gap="md">
												<Text fontWeight="medium">調理時間の目安を指定する</Text>
												<Checkbox
													aria-label="調理時間の目安を指定する"
													checked={draft.constraints.maxCookingMinutes !== null}
													onChange={(event) =>
														setDraft((current) => ({
															...current,
															constraints: {
																...current.constraints,
																maxCookingMinutes: event.target.checked
																	? (current.constraints.maxCookingMinutes ?? 60)
																	: null,
															},
														}))
													}
												/>
											</Flex>

											{draft.constraints.maxCookingMinutes !== null ? (
												<Flex align="center" gap="sm" justify="end" wrap="wrap">
													<NumberInput
														max={300}
														min={10}
														onChange={(_valueAsString, valueAsNumber) =>
															setDraft((current) => ({
																...current,
																constraints: {
																	...current.constraints,
																	maxCookingMinutes: getSafeTime(valueAsNumber),
																},
															}))
														}
														step={10}
														value={draft.constraints.maxCookingMinutes}
														w="128px"
													/>
													<Text color="fg.subtle" fontSize="sm">
														この時間感をもとに工程の長さを組みます
													</Text>
												</Flex>
											) : (
												<Text color="fg.subtle" fontSize="sm">
													時間制約は付けずに、レシピの内容を優先して工程を生成します。
												</Text>
											)}
										</VStack>

										<Separator />

										<VStack align="stretch" gap="sm">
											<Text fontWeight="semibold" fontSize="sm">
												食事制限
											</Text>
											{dietaryRestrictionList.map((item) => (
												<Flex key={item.id} align="center" justify="space-between" gap="md">
													<Text>{item.label}</Text>
													<Checkbox
														aria-label={item.label}
														checked={draft.constraints.dietaryRestrictions[item.id] ?? false}
														onChange={(event) =>
															setDietaryRestriction(item.id, event.target.checked)
														}
													/>
												</Flex>
											))}
										</VStack>

										<Separator />

										<VStack align="stretch" gap="xs">
											<Text fontWeight="semibold" fontSize="sm">
												避けたい食材・アレルゲン
											</Text>
											<Flex justify="end">
												<Textarea
													maxW="20rem"
													placeholder="例: 卵、小麦、えび"
													onChange={(event) =>
														setDraft((current) => ({
															...current,
															constraints: {
																...current.constraints,
																allergens: event.target.value,
															},
														}))
													}
													resize="none"
													rows={3}
													value={draft.constraints.allergens}
													w="full"
												/>
											</Flex>
											<Text color="fg.subtle" fontSize="xs">
												カンマ区切りで入力すると、買い物リストや工程上の注意にも反映しやすくなります。
											</Text>
										</VStack>
									</VStack>
								</TabsPanel>
							</TabsPanels>
						</TabsRoot>
					</VStack>
				</DrawerBody>

				<DrawerFooter borderTopWidth="1px" borderColor="border.muted" gap="sm">
					<Box flex="1">
						<Text color={saveError ? 'red.600' : 'fg.subtle'} fontSize="xs">
							{saveError ?? '保存すると、これ以降の工程生成に自動で反映されます。'}
						</Text>
					</Box>
					<Button
						variant="ghost"
						onClick={() => {
							setDraft(createDefaultPlanningSettings());
							setSaveError(null);
						}}
					>
						初期値に戻す
					</Button>
					<Button variant="ghost" onClick={onClose}>
						閉じる
					</Button>
					<Button
						disabled={!isDirty}
						loading={isSaving}
						variant="solid"
						onClick={() => void handleSave()}
					>
						保存
					</Button>
				</DrawerFooter>
			</DrawerContent>
		</DrawerRoot>
	);
};
