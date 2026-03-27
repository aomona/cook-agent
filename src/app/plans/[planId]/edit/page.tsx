import { Button, Flex, Heading, Text, VStack } from '@workspaces/ui';
import { cookies } from 'next/headers';
import NextLink from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getRequestActor } from '@/lib/create-session';
import { getOwnedPlanEditorData } from '@/lib/plans/queries';
import { PlanEditPageClient } from './plan-edit-page-client';

export default async function PlanEditPage({ params }: { params: Promise<{ planId: string }> }) {
	const cookieStore = await cookies();
	const actor = await getRequestActor(cookieStore);

	if (!actor) {
		redirect('/');
	}

	const { planId } = await params;
	const plan = await getOwnedPlanEditorData(planId, actor.userId);

	if (!plan) {
		notFound();
	}

	return (
		<Flex align="center" justify="center" minH="100vh" px="md" py="xl">
			<VStack align="stretch" gap="lg" maxW="4xl" w="full">
				<Flex justify="space-between" wrap="wrap" gap="md">
					<VStack align="stretch" gap="xs">
						<Heading size="xl">{plan.title}</Heading>
						<Text color="fg.subtle">構造化済みレシピから実行可能な工程を生成します。</Text>
					</VStack>
					<NextLink href={`/plans/${plan.id}`}>
						<Button as="span" variant="outline">
							計画詳細に戻る
						</Button>
					</NextLink>
				</Flex>

				<PlanEditPageClient initialPlan={plan} />
			</VStack>
		</Flex>
	);
}
