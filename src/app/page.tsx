import { Button, Card, Flex, Heading, Text, VStack } from '@workspaces/ui';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { getPlanListItems } from '@/lib/plans/queries';
import { PlanListInfinite } from './plan-list-infinite';
import { SignInButton } from './sign-in-button';

export default async function Home() {
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	if (!session) {
		return (
			<Flex align="center" justify="center" minH="100vh" px="md" py={{ base: 'xl', md: '2xl' }}>
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
		<Flex align="start" justify="center" minH="100vh" px="md" py={{ base: 'xl', md: '2xl' }}>
			<VStack align="stretch" gap="lg" maxW="3xl" textAlign="left" w="full">
				<Flex align="center" gap="md" justify="space-between">
					<Heading size="xl">調理計画一覧</Heading>
					<form action="/create/start" method="post">
						<Button type="submit" variant="solid">
							新規作成
						</Button>
					</form>
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
					<PlanListInfinite plans={plans} />
				)}
			</VStack>
		</Flex>
	);
}
