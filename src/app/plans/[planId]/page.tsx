import { Badge, Button, Card, Flex, Heading, Text, VStack } from '@workspaces/ui';
import { cookies } from 'next/headers';
import NextLink from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { PlanStepCards } from '@/components/plan-step-cards';
import { PlanTimelineLazy } from '@/components/plan-timeline-lazy';
import { RecipeIngredientsSection } from '@/components/recipe-ingredients-section';
import { getRequestActor } from '@/lib/create-session';
import {
	formatPlanDateTime,
	getPlanStatusColorScheme,
	getPlanStatusLabel,
	getRecipeProcessingLabel,
} from '@/lib/plans/presentation';
import { getOwnedPlanEditorData } from '@/lib/plans/queries';
import { DeletePlanButton } from './delete-plan-button';

export default async function PlanDetailPage({ params }: { params: Promise<{ planId: string }> }) {
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

	const requestedServings = plan.activeVersion?.plan.servings ?? plan.requestedServings ?? 1;

	const recipeTitleById = Object.fromEntries(
		plan.recipes.map((recipe) => [
			recipe.id,
			recipe.title ?? recipe.normalizedRecipe?.title ?? recipe.label,
		]),
	);
	const recipeIngredients = plan.recipes
		.filter((recipe) => recipe.normalizedRecipe?.ingredients.length)
		.map((recipe) => ({
			baseServings: recipe.normalizedRecipe?.servings,
			id: recipe.id,
			ingredients: recipe.normalizedRecipe?.ingredients ?? [],
			requestedServings,
			title: recipe.title ?? recipe.normalizedRecipe?.title ?? recipe.label,
		}));

	return (
		<Flex align="center" justify="center" minH="100vh" px="md" py="xl">
			<VStack align="stretch" gap="lg" maxW="3xl" w="full">
				<Flex justify="space-between" wrap="wrap" gap="md">
					<VStack align="stretch" gap="xs">
						<Heading size="xl">{plan.title}</Heading>
						<Text color="fg.subtle">作成した計画の概要と抽出済みレシピを確認できます。</Text>
					</VStack>
					<Flex align={{ base: 'stretch', md: 'end' }} gap="sm" w={{ base: 'full', md: 'auto' }}>
						<NextLink href="/">
							<Button as="span" variant="ghost">
								一覧に戻る
							</Button>
						</NextLink>
						<Flex gap="sm" w="full" justify="end" wrap="wrap">
							<DeletePlanButton planId={plan.id} />
							{plan.status === 'draft' ? (
								<NextLink href={`/create/open/${plan.id}`}>
									<Button as="span" variant="solid">
										編集を続ける
									</Button>
								</NextLink>
							) : null}
						</Flex>
					</Flex>
				</Flex>

				<Card.Root variant="outline">
					<Card.Body gap="md">
						<Flex align="center" gap="sm" wrap="wrap">
							<Badge colorScheme={getPlanStatusColorScheme(plan.status)} variant="subtle">
								{getPlanStatusLabel(plan.status)}
							</Badge>
							<Text color="fg.subtle">更新日時: {formatPlanDateTime(plan.updatedAt)}</Text>
						</Flex>
						<Flex gap="md" wrap="wrap">
							<Text color="fg.subtle">レシピ数: {plan.recipes.length}</Text>
							<Text color="fg.subtle">
								人数: {plan.requestedServings ? `${plan.requestedServings}人分` : '未設定'}
							</Text>
							<Text color="fg.subtle">作成日時: {formatPlanDateTime(plan.createdAt)}</Text>
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
											{getRecipeProcessingLabel(recipe.processingStatus)}
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

				<RecipeIngredientsSection recipes={recipeIngredients} />

				{plan.activeVersion ? (
					<VStack align="stretch" gap="md">
						<Flex align="center" justify="space-between" gap="sm" wrap="wrap">
							<VStack align="stretch" gap="xs">
								<Heading size="md">生成済み工程</Heading>
								<Text color="fg.subtle">
									v{plan.activeVersion.versionNumber} / {plan.activeVersion.plan.servings}
									人分 / {plan.activeVersion.plan.steps.length} ステップ
								</Text>
							</VStack>
							<NextLink href={`/plans/${plan.id}/edit`}>
								<Button as="span" variant="outline">
									工程を再生成
								</Button>
							</NextLink>
						</Flex>

						<PlanTimelineLazy plan={plan.activeVersion.plan} recipeTitleById={recipeTitleById} />

						<PlanStepCards plan={plan.activeVersion.plan} />
					</VStack>
				) : null}
			</VStack>
		</Flex>
	);
}
