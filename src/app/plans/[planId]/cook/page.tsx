import { Button, Card, Flex, Heading, Text, VStack } from '@workspaces/ui';
import { cookies } from 'next/headers';
import NextLink from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { CookRuntimePageClient } from '@/app/plans/[planId]/cook/cook-runtime-page-client';
import { getOwnedCookSessionSnapshotByPlanId } from '@/lib/cook-runtime/queries';
import { getRequestActor } from '@/lib/create-session';

export default async function PlanCookPage({ params }: { params: Promise<{ planId: string }> }) {
	const actor = await getRequestActor(await cookies());

	if (!actor) {
		redirect('/');
	}

	const { planId } = await params;
	const snapshot = await getOwnedCookSessionSnapshotByPlanId(planId, actor.userId);

	if (!snapshot) {
		notFound();
	}

	return (
		<Flex align="center" justify="center" minH="100vh" px="md" py="xl">
			<VStack align="stretch" gap="lg" maxW="6xl" w="full">
				<Flex
					align={{ base: 'stretch', md: 'center' }}
					justify="space-between"
					gap="md"
					wrap="wrap"
				>
					<VStack align="stretch" gap="xs">
						<Heading size="xl">{snapshot.plan.title}</Heading>
						<Text color="fg.subtle">
							音声主導の realtime cook runtime
							をここから育てます。まずはセッション状態と実行中の工程を確認できます。
						</Text>
					</VStack>
					<NextLink href={`/plans/${snapshot.plan.id}`}>
						<Button as="span" variant="outline">
							計画詳細に戻る
						</Button>
					</NextLink>
				</Flex>

				{snapshot.plan.document.steps.length === 0 ? (
					<Card.Root variant="outline">
						<Card.Body gap="sm">
							<Heading size="md">工程がまだありません</Heading>
							<Text color="fg.subtle">
								調理 runtime を始める前に、編集画面で工程を生成してください。
							</Text>
							<NextLink href={`/plans/${snapshot.plan.id}/edit`}>
								<Button as="span" alignSelf="start">
									工程を生成する
								</Button>
							</NextLink>
						</Card.Body>
					</Card.Root>
				) : (
					<CookRuntimePageClient initialSnapshot={snapshot} />
				)}
			</VStack>
		</Flex>
	);
}
