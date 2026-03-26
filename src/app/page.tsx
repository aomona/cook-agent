import { Badge, Button, Card, Flex, For, Heading, Text, VStack } from '@workspaces/ui';
import { headers } from 'next/headers';
import NextLink from 'next/link';
import { auth } from '@/lib/auth';
import {
	formatPlanDateTime,
	getPlanStatusColorScheme,
	getPlanStatusLabel,
} from '@/lib/plans/presentation';
import { getPlanListItems } from '@/lib/plans/queries';
import { SignInButton } from './sign-in-button';

export default async function Home() {
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	if (!session) {
		return (
			<Flex align="center" justify="center" minH="100vh" px="md">
				<Card.Root maxW="lg" w="full" variant="outline">
					<Card.Body gap="md" p="xl">
						<VStack align="stretch" gap="xs">
							<Heading size="xl">Cook Agent</Heading>
							<Text color="fg.subtle">このアプリを使用するにはログインが必要です。</Text>
						</VStack>
						<SignInButton />
					</Card.Body>
				</Card.Root>
			</Flex>
		);
	}

	const plans = await getPlanListItems(session.user.id);

	return (
		<Flex align="center" justify="center" minH="100vh" px="md">
			<VStack align="stretch" gap="lg" maxW="3xl" textAlign="left" w="full">
				<Flex align="center" gap="md" justify="space-between">
					<Heading size="xl">調理計画一覧</Heading>
					<NextLink href="/create/start">
						<Button as="span" variant="solid">
							新規作成
						</Button>
					</NextLink>
				</Flex>

				{plans.length === 0 ? (
					<Card.Root variant="outline">
						<Card.Body gap="sm" p="xl">
							<Heading size="md">まだ計画がありません</Heading>
							<Text color="fg.subtle">
								新規作成からレシピを追加すると、ここに計画一覧が表示されます。
							</Text>
						</Card.Body>
					</Card.Root>
				) : (
					<VStack align="stretch" gap="md">
						<For each={plans}>
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
														<Badge
															colorScheme={getPlanStatusColorScheme(plan.status)}
															variant="subtle"
														>
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
				)}
			</VStack>
		</Flex>
	);
}
