import { Button, Card, Flex, Heading, Status, Text, VStack } from '@workspaces/ui';
import { cookies } from 'next/headers';
import NextLink from 'next/link';
import { redirect } from 'next/navigation';
import { getActiveCreatePlanId, getCreatePlanData, getRequestActor } from '@/lib/create-session';

export default async function PlanPage() {
	const cookieStore = await cookies();
	const actor = await getRequestActor(cookieStore);

	if (!actor) {
		redirect('/');
	}

	const planId = getActiveCreatePlanId(cookieStore);

	if (!planId) {
		redirect('/create');
	}

	const plan = await getCreatePlanData(planId, actor.userId);

	if (!plan) {
		redirect('/create');
	}

	if (!plan.canProceed) {
		redirect('/create');
	}

	return (
		<Flex align="center" justify="center" minH="100vh" px="md" py="xl">
			<VStack align="stretch" gap="lg" maxW="3xl" w="full">
				<Flex justify="space-between" wrap="wrap" gap="md">
					<VStack align="stretch" gap="xs">
						<Heading size="xl">plan の下準備ができました</Heading>
						<Text color="fg.subtle">
							抽出済みのレシピ要約を確認できる状態です。次の plan 生成 UI はこの draft plan
							を使って実装できます。
						</Text>
					</VStack>
					<NextLink href="/create">
						<Button as="span" variant="outline">
							create に戻る
						</Button>
					</NextLink>
				</Flex>

				<Card.Root variant="outline">
					<Card.Body gap="md">
						<Status value="success">抽出完了</Status>
						<Heading size="md">{plan.title}</Heading>
						<Text color="fg.subtle">{plan.recipes.length} 件のレシピ要約を保持しています。</Text>
					</Card.Body>
				</Card.Root>

				<VStack align="stretch" gap="md">
					{plan.recipes.map((recipe) => (
						<Card.Root key={recipe.id} variant="outline">
							<Card.Body gap="sm">
								<Heading size="sm">{recipe.title ?? recipe.label}</Heading>
								{recipe.summary ? <Text>{recipe.summary}</Text> : null}
							</Card.Body>
						</Card.Root>
					))}
				</VStack>
			</VStack>
		</Flex>
	);
}
