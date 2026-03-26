import { Button, Flex, Heading, Text, VStack } from '@workspaces/ui';
import { cookies } from 'next/headers';
import NextLink from 'next/link';
import { redirect } from 'next/navigation';
import { getActiveCreatePlanId, getRequestActor } from '@/lib/create-session';
import { getOwnedPlanEditorData } from '@/lib/plans/queries';
import { PlanPageClient } from './plan-page-client';

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

	const plan = await getOwnedPlanEditorData(planId, actor.userId);

	if (!plan) {
		redirect('/create');
	}

	return (
		<Flex align="center" justify="center" minH="100vh" px="md" py="xl">
			<VStack align="stretch" gap="lg" maxW="4xl" w="full">
				<Flex justify="space-between" wrap="wrap" gap="md">
					<VStack align="stretch" gap="xs">
						<Heading size="xl">{plan.title}</Heading>
						<Text color="fg.subtle">構造化済みレシピから実行可能な工程を生成します。</Text>
					</VStack>
					<NextLink href="/create">
						<Button as="span" variant="outline">
							create に戻る
						</Button>
					</NextLink>
				</Flex>

				<PlanPageClient initialPlan={plan} />
			</VStack>
		</Flex>
	);
}
