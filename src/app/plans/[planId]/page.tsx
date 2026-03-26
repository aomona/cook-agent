import { Badge, Button, Card, Flex, Heading, Text, VStack } from '@workspaces/ui';
import { cookies } from 'next/headers';
import NextLink from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCreatePlanData, getRequestActor } from '@/lib/create-session';

const formatDateTime = (value: string): string =>
	new Intl.DateTimeFormat('ja-JP', {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
	}).format(new Date(value));

const getStatusColorScheme = (status: 'draft' | 'ready' | 'archived'): string => {
	if (status === 'ready') return 'green';
	if (status === 'archived') return 'gray';

	return 'blue';
};

const getStatusLabel = (status: 'draft' | 'ready' | 'archived'): string => {
	if (status === 'ready') return 'READY';
	if (status === 'archived') return 'ARCHIVED';

	return 'DRAFT';
};

export default async function PlanDetailPage({ params }: { params: Promise<{ planId: string }> }) {
	const cookieStore = await cookies();
	const actor = await getRequestActor(cookieStore);

	if (!actor) {
		redirect('/');
	}

	const { planId } = await params;
	const plan = await getCreatePlanData(planId, actor.userId);

	if (!plan) {
		notFound();
	}

	return (
		<Flex align="center" justify="center" minH="100vh" px="md" py="xl">
			<VStack align="stretch" gap="lg" maxW="3xl" w="full">
				<Flex justify="space-between" wrap="wrap" gap="md">
					<VStack align="stretch" gap="xs">
						<Heading size="xl">{plan.title}</Heading>
						<Text color="fg.subtle">作成した計画の概要と抽出済みレシピを確認できます。</Text>
					</VStack>
					<Flex gap="sm" wrap="wrap">
						<NextLink href="/">
							<Button as="span" variant="ghost">
								一覧に戻る
							</Button>
						</NextLink>
						{plan.status === 'draft' ? (
							<NextLink href={`/create/open/${plan.id}`}>
								<Button as="span" variant="solid">
									編集を続ける
								</Button>
							</NextLink>
						) : null}
					</Flex>
				</Flex>

				<Card.Root variant="outline">
					<Card.Body gap="md">
						<Flex align="center" gap="sm" wrap="wrap">
							<Badge colorScheme={getStatusColorScheme(plan.status)} variant="subtle">
								{getStatusLabel(plan.status)}
							</Badge>
							<Text color="fg.subtle">更新日時: {formatDateTime(plan.updatedAt)}</Text>
						</Flex>
						<Flex gap="md" wrap="wrap">
							<Text color="fg.subtle">レシピ数: {plan.recipes.length}</Text>
							<Text color="fg.subtle">
								人数: {plan.requestedServings ? `${plan.requestedServings}人分` : '未設定'}
							</Text>
							<Text color="fg.subtle">作成日時: {formatDateTime(plan.createdAt)}</Text>
						</Flex>
					</Card.Body>
				</Card.Root>

				{plan.recipes.length === 0 ? (
					<Card.Root variant="outline">
						<Card.Body gap="sm">
							<Heading size="md">まだレシピがありません</Heading>
							<Text color="fg.subtle">レシピを追加すると、ここから要約内容を確認できます。</Text>
						</Card.Body>
					</Card.Root>
				) : (
					<VStack align="stretch" gap="md">
						{plan.recipes.map((recipe) => (
							<Card.Root key={recipe.id} variant="outline">
								<Card.Body gap="sm">
									<Flex align="start" justify="space-between" gap="sm">
										<Badge colorScheme={recipe.type === 'url' ? 'blue' : 'amber'} variant="subtle">
											{recipe.type === 'url' ? 'URL' : 'TEXT'}
										</Badge>
										<Text color="fg.subtle">
											{recipe.processingStatus === 'completed'
												? '抽出完了'
												: recipe.processingStatus === 'failed'
													? '抽出失敗'
													: '抽出中'}
										</Text>
									</Flex>
									<Heading size="md">{recipe.title ?? recipe.label}</Heading>
									{recipe.summary ? <Text whiteSpace="pre-wrap">{recipe.summary}</Text> : null}
									<Text color="fg.subtle" lineClamp={2} whiteSpace="pre-wrap">
										{recipe.label}
									</Text>
								</Card.Body>
							</Card.Root>
						))}
					</VStack>
				)}
			</VStack>
		</Flex>
	);
}
