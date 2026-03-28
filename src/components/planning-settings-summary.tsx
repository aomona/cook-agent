'use client';

import { Badge, Card, Flex, Heading, Text, useColorModeValue, VStack } from '@workspaces/ui';
import type { ReactNode } from 'react';
import type { PlanningSettings } from '@/lib/planning-settings';
import { getPlanningSettingsSummary } from '@/lib/planning-settings';

type Props = {
	title: string;
	description?: string;
	settings?: PlanningSettings | null;
	availableEquipment?: string[];
	constraints?: string[];
	action?: ReactNode;
	emptyLabel?: string;
};

export const PlanningSettingsSummary = ({
	action,
	availableEquipment,
	constraints,
	description,
	emptyLabel = 'まだ条件は設定されていません。',
	settings,
	title,
}: Props) => {
	const summaryBackground = useColorModeValue(
		'linear-gradient(135deg, rgba(249, 250, 251, 0.98), rgba(236, 253, 245, 0.92))',
		'linear-gradient(135deg, rgba(18, 24, 38, 0.94), rgba(20, 83, 45, 0.26))',
	);
	const summaryBorderColor = useColorModeValue('green.200', 'green.700');
	const summary = settings ? getPlanningSettingsSummary(settings) : null;
	const equipmentItems = summary?.equipment ?? [];
	const maxCookingMinutes = summary?.maxCookingMinutes ?? null;
	const dietaryRestrictions = summary?.dietaryRestrictions ?? [];
	const allergens = summary?.allergens ?? [];
	const fallbackConstraints = constraints ?? [];
	const fallbackEquipment = availableEquipment ?? [];
	const hasStructuredSummary = Boolean(summary);
	const hasFallbackContent = fallbackEquipment.length > 0 || fallbackConstraints.length > 0;

	return (
		<Card.Root bg={summaryBackground} borderColor={summaryBorderColor} variant="outline">
			<Card.Body gap="md">
				<Flex align={{ base: 'stretch', md: 'start' }} justify="space-between" gap="md" wrap="wrap">
					<VStack align="stretch" gap="xs">
						<Heading size="md">{title}</Heading>
						{description ? <Text color="fg.subtle">{description}</Text> : null}
					</VStack>
					{action ? action : null}
				</Flex>

				<Flex gap="sm" wrap="wrap">
					<Badge colorScheme="green" variant="solid">
						器具 {hasStructuredSummary ? equipmentItems.length : fallbackEquipment.length} 件
					</Badge>
					<Badge colorScheme={maxCookingMinutes ? 'orange' : 'gray'} variant="subtle">
						{maxCookingMinutes ? `目安 ${maxCookingMinutes}分以内` : '時間制約なし'}
					</Badge>
					{dietaryRestrictions.length > 0 ? (
						<Badge colorScheme="teal" variant="subtle">
							食事制限 {dietaryRestrictions.length} 件
						</Badge>
					) : null}
					{allergens.length > 0 ? (
						<Badge colorScheme="red" variant="subtle">
							回避食材 {allergens.length} 件
						</Badge>
					) : null}
				</Flex>

				{hasStructuredSummary ? (
					<VStack align="stretch" gap="sm">
						<VStack align="stretch" gap="xs">
							<Text fontSize="sm" fontWeight="semibold">
								利用する前提の器具
							</Text>
							<Flex gap="sm" wrap="wrap">
								{equipmentItems.map((item) => (
									<Badge key={item.id} colorScheme="green" px="sm" py="xs" variant="subtle">
										{item.icon} {item.label} x{item.count}
									</Badge>
								))}
							</Flex>
						</VStack>

						{dietaryRestrictions.length > 0 ? (
							<VStack align="stretch" gap="xs">
								<Text fontSize="sm" fontWeight="semibold">
									食事制限
								</Text>
								<Flex gap="sm" wrap="wrap">
									{dietaryRestrictions.map((item) => (
										<Badge key={item} colorScheme="teal" variant="subtle">
											{item}
										</Badge>
									))}
								</Flex>
							</VStack>
						) : null}

						{allergens.length > 0 ? (
							<VStack align="stretch" gap="xs">
								<Text fontSize="sm" fontWeight="semibold">
									避けたい食材・アレルゲン
								</Text>
								<Flex gap="sm" wrap="wrap">
									{allergens.map((item) => (
										<Badge key={item} colorScheme="red" variant="subtle">
											{item}
										</Badge>
									))}
								</Flex>
							</VStack>
						) : null}
					</VStack>
				) : hasFallbackContent ? (
					<VStack align="stretch" gap="sm">
						{fallbackEquipment.length > 0 ? (
							<VStack align="stretch" gap="xs">
								<Text fontSize="sm" fontWeight="semibold">
									利用可能な器具
								</Text>
								<Flex gap="sm" wrap="wrap">
									{fallbackEquipment.map((item) => (
										<Badge key={item} colorScheme="green" variant="subtle">
											{item}
										</Badge>
									))}
								</Flex>
							</VStack>
						) : null}

						{fallbackConstraints.length > 0 ? (
							<VStack align="stretch" gap="xs">
								<Text fontSize="sm" fontWeight="semibold">
									反映済みの制約
								</Text>
								<VStack align="stretch" gap="xs">
									{fallbackConstraints.map((item) => (
										<Text key={item} color="fg.subtle" fontSize="sm">
											{item}
										</Text>
									))}
								</VStack>
							</VStack>
						) : null}
					</VStack>
				) : (
					<Text color="fg.subtle" fontSize="sm">
						{emptyLabel}
					</Text>
				)}
			</Card.Body>
		</Card.Root>
	);
};
