import { Badge, Card, Flex, Heading, Text, VStack } from '@workspaces/ui';
import type { PlanDocument } from '@/lib/plans/types';

export const PlanStepCards = ({
	plan,
	recipeTitleById,
	showRecipeSource = false,
	showTimers = false,
	useDurationBadge = false,
}: {
	plan: PlanDocument;
	recipeTitleById?: Record<string, string>;
	showRecipeSource?: boolean;
	showTimers?: boolean;
	useDurationBadge?: boolean;
}) =>
	plan.steps.map((step, index) => (
		<Card.Root key={step.id} variant="outline">
			<Card.Body gap="sm">
				<Flex align="start" justify="space-between" gap="sm" wrap="wrap">
					<VStack align="stretch" gap="xs">
						<Text color="fg.subtle" fontSize="sm">
							STEP {index + 1}
						</Text>
						<Heading size="sm">{step.title}</Heading>
					</VStack>
					{useDurationBadge ? (
						<Badge colorScheme="blue" variant="subtle">
							約{step.estimatedMinutes}分
						</Badge>
					) : (
						<Text color="fg.subtle">約{step.estimatedMinutes}分</Text>
					)}
				</Flex>

				<Text whiteSpace="pre-wrap">{step.description}</Text>

				{showRecipeSource && step.recipeSourceId ? (
					<Text color="fg.subtle" fontSize="sm">
						元レシピ: {recipeTitleById?.[step.recipeSourceId] ?? step.recipeSourceId}
					</Text>
				) : null}

				{step.dependencies.length > 0 ? (
					<Text color="fg.subtle" fontSize="sm">
						依存: {step.dependencies.join(', ')}
					</Text>
				) : null}

				<Text color="fg.subtle" fontSize="sm">
					並行実行: {step.canParallelize ? '可能' : '不可'}
				</Text>

				{showTimers && step.timers?.length ? (
					<Text color="fg.subtle" fontSize="sm">
						タイマー: {step.timers.map((timer) => timer.label).join(', ')}
					</Text>
				) : null}

				{step.notesForUser?.length ? (
					<Text color="fg.subtle" fontSize="sm">
						注意: {step.notesForUser.join(' / ')}
					</Text>
				) : null}

				{step.recoveryTips?.length ? (
					<Text color="fg.subtle" fontSize="sm">
						リカバリー: {step.recoveryTips.join(' / ')}
					</Text>
				) : null}
			</Card.Body>
		</Card.Root>
	));
