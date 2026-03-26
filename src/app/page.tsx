'use client';

import { Button, Card, Flex, For, Heading, LinkBox, Text, VStack } from '@workspaces/ui';
import NextLink from 'next/link';

const cookingPlans = [
	{
		id: 'plan-001',
		name: '春野菜のパスタ献立',
		duration: '45分',
		createdAt: '2026/03/24 18:20',
	},
	{
		id: 'plan-002',
		name: '鶏の照り焼き定食',
		duration: '60分',
		createdAt: '2026/03/22 12:10',
	},
	{
		id: 'plan-003',
		name: '週末ブランチプレート',
		duration: '35分',
		createdAt: '2026/03/20 09:05',
	},
] as const;

export default function Home() {
	return (
		<Flex align="center" h="full" justify="center" px="md">
			<VStack align="stretch" gap="lg" maxW="3xl" textAlign="left" w="full">
				<Flex align="center" gap="md" justify="space-between">
					<Heading size="xl">調理計画一覧</Heading>
					<Button as={NextLink} href="/create" variant="solid">
						新規作成
					</Button>
				</Flex>

				<VStack align="stretch" gap="md">
					<For each={cookingPlans}>
						{(plan) => (
							<LinkBox.Root
								as={Card.Root}
								key={plan.id}
								transition="background-color 0.2s ease, transform 0.2s ease"
								variant="outline"
								_hover={{ bg: 'blackAlpha.50', transform: 'translateY(-1px)' }}
							>
								<Card.Body gap="sm">
									<LinkBox.Overlay
										as={NextLink}
										color="black"
										fontSize="lg"
										fontWeight="semibold"
										href={`/plans/${plan.id}`}
										textDecoration="none"
										_hover={{ opacity: 0.7 }}
									>
										{plan.name}
									</LinkBox.Overlay>

									<Flex
										align={{ base: 'start', md: 'center' }}
										direction={{ base: 'column', md: 'row' }}
										gap={{ base: 'xs', md: 'md' }}
									>
										<Text color="GrayText">所要時間: {plan.duration}</Text>
										<Text color="GrayText">作成日時: {plan.createdAt}</Text>
									</Flex>
								</Card.Body>
							</LinkBox.Root>
						)}
					</For>
				</VStack>
			</VStack>
		</Flex>
	);
}
