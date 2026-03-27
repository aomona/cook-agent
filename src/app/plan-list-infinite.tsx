'use client';

import { Badge, Card, Flex, For, InfiniteScrollArea, Loading, Text, VStack } from '@workspaces/ui';
import NextLink from 'next/link';
import { useMemo, useState } from 'react';
import {
	formatPlanDateTime,
	getPlanStatusColorScheme,
	getPlanStatusLabel,
} from '@/lib/plans/presentation';
import type { PlanListItem } from '@/lib/plans/queries';

const PAGE_SIZE = 12;

export const PlanListInfinite = ({ plans }: { plans: PlanListItem[] }) => {
	const [visibleCount, setVisibleCount] = useState(Math.min(PAGE_SIZE, plans.length));
	const visiblePlans = useMemo(() => plans.slice(0, visibleCount), [plans, visibleCount]);

	if (plans.length === 0) {
		return null;
	}

	return (
		<InfiniteScrollArea
			finish={
				plans.length > PAGE_SIZE ? (
					<Text align="center" color="fg.subtle" fontSize="sm" py="md">
						すべての計画を表示しました。
					</Text>
				) : null
			}
			loading={
				<Flex justify="center" py="md">
					<Loading.Oval color="blue.500" fontSize="lg" />
				</Flex>
			}
			onLoad={({ finish }) => {
				setVisibleCount((currentCount) => {
					const nextCount = Math.min(currentCount + PAGE_SIZE, plans.length);

					if (nextCount >= plans.length) {
						finish();
					}

					return nextCount;
				});
			}}
			rootMargin="0px 0px 240px 0px"
		>
			<VStack align="stretch" gap="md">
				<For each={visiblePlans}>
					{(plan) => (
						<NextLink
							key={plan.id}
							href={`/plans/${plan.id}`}
							style={{ color: 'inherit', textDecoration: 'none' }}
						>
							<Card.Root
								transition="background-color 0.2s ease, transform 0.2s ease"
								variant="outline"
								_hover={{ bg: 'bg.subtle', transform: 'translateY(-1px)' }}
							>
								<Card.Body gap="sm">
									<Flex align="start" justify="space-between" gap="sm" wrap="wrap">
										<VStack align="stretch" gap="xs">
											<Text fontSize="lg" fontWeight="semibold">
												{plan.title}
											</Text>
											<Flex gap="sm" wrap="wrap">
												<Badge colorScheme={getPlanStatusColorScheme(plan.status)} variant="subtle">
													{getPlanStatusLabel(plan.status)}
												</Badge>
												{plan.requestedServings ? (
													<Badge colorScheme="amber" variant="subtle">
														{plan.requestedServings}人分
													</Badge>
												) : null}
											</Flex>
										</VStack>
										<Text color="fg.subtle">更新: {formatPlanDateTime(plan.updatedAt)}</Text>
									</Flex>

									<Flex
										align={{ base: 'start', md: 'center' }}
										direction={{ base: 'column', md: 'row' }}
										gap={{ base: 'xs', md: 'md' }}
									>
										<Text color="fg.subtle">レシピ: {plan.recipeCount}件</Text>
										<Text color="fg.subtle">
											抽出完了: {plan.completedRecipeCount}/{plan.recipeCount}
										</Text>
										<Text color="fg.subtle">作成: {formatPlanDateTime(plan.createdAt)}</Text>
									</Flex>
								</Card.Body>
							</Card.Root>
						</NextLink>
					)}
				</For>
			</VStack>
		</InfiniteScrollArea>
	);
};
