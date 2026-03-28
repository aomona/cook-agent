import { Badge, Card, Flex, Heading, Text, VStack } from '@workspaces/ui';
import { formatStructuredAmount } from '@/lib/plans/presentation';
import type { PlanDocument } from '@/lib/plans/types';

const getKindLabel = (kind: PlanDocument['steps'][number]['kind']): string => {
	switch (kind) {
		case 'cleanup':
			return '洗い物';
		case 'cook':
			return '加熱';
		case 'finish':
			return '仕上げ';
		case 'prep':
			return '下準備';
		case 'wait':
			return '待機';
		default:
			return kind;
	}
};

const getKindColorScheme = (kind: PlanDocument['steps'][number]['kind']): string => {
	switch (kind) {
		case 'cleanup':
			return 'gray';
		case 'cook':
			return 'blue';
		case 'finish':
			return 'purple';
		case 'prep':
			return 'green';
		case 'wait':
			return 'teal';
		default:
			return 'gray';
	}
};

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
}) => {
	const stepLabelById = Object.fromEntries(plan.steps.map((step) => [step.id, step.label]));
	const materialLabelById = Object.fromEntries(
		plan.materials.map((material) => [
			material.id,
			formatStructuredAmount(material)
				? `${material.name} (${formatStructuredAmount(material)})`
				: material.name,
		]),
	);

	return plan.steps.map((step, index) => {
		return (
			<Card.Root key={step.id} variant="outline">
				<Card.Body gap="sm">
					<Flex align="start" justify="space-between" gap="sm" wrap="wrap">
						<VStack align="stretch" gap="xs">
							<Text color="fg.subtle" fontSize="sm">
								STEP {index + 1}
							</Text>
							<Flex align="center" gap="sm" wrap="wrap">
								<Heading size="sm">{step.label}</Heading>
								<Badge colorScheme={getKindColorScheme(step.kind)} variant="subtle">
									{getKindLabel(step.kind)}
								</Badge>
							</Flex>
						</VStack>
						<VStack align="end" gap="xs">
							{useDurationBadge ? (
								<Badge colorScheme="blue" variant="subtle">
									{step.time}分
								</Badge>
							) : (
								<Text color="fg.subtle">{step.time}分</Text>
							)}
							<Text color="fg.subtle" fontSize="sm">
								{step.timeline.start}-{step.timeline.end}分
							</Text>
						</VStack>
					</Flex>

					<Text whiteSpace="pre-wrap">{step.instructions}</Text>

					{showRecipeSource && step.recipeSourceId ? (
						<Text color="fg.subtle" fontSize="sm">
							元レシピ: {recipeTitleById?.[step.recipeSourceId] ?? step.recipeSourceId}
						</Text>
					) : null}

					{step.after.length > 0 ? (
						<Text color="fg.subtle" fontSize="sm">
							after: {step.after.map((stepId) => stepLabelById[stepId] ?? stepId).join(', ')}
						</Text>
					) : null}

					{step.req && Object.keys(step.req).length > 0 ? (
						<Text color="fg.subtle" fontSize="sm">
							リソース:{' '}
							{Object.entries(step.req)
								.map(([key, value]) => `${key}:${value}`)
								.join(', ')}
						</Text>
					) : null}

					{step.uses?.length ? (
						<Text color="fg.subtle" fontSize="sm">
							使用材料:{' '}
							{step.uses
								.map((materialId) => materialLabelById[materialId] ?? materialId)
								.join(', ')}
						</Text>
					) : null}

					{typeof step.slack === 'number' && step.slack > 0 ? (
						<Text color="fg.subtle" fontSize="sm">
							許容遅延: {step.slack}分
						</Text>
					) : null}

					{showTimers && step.timers?.length ? (
						<Text color="fg.subtle" fontSize="sm">
							タイマー: {step.timers.map((timer) => timer.label).join(', ')}
						</Text>
					) : null}

					{step.tags?.length ? (
						<Flex gap="xs" wrap="wrap">
							{step.tags.map((tag) => (
								<Badge
									key={tag}
									colorScheme={tag.toLowerCase() === 'cleanup' ? 'amber' : 'gray'}
									variant="subtle"
								>
									{tag}
								</Badge>
							))}
						</Flex>
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
		);
	});
};
