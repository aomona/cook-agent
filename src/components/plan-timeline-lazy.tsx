'use client';

import { Card, Text } from '@workspaces/ui';
import dynamic from 'next/dynamic';
import type { PlanDocument } from '@/lib/plans/types';

const PlanTimeline = dynamic(
	() => import('@/components/plan-timeline').then((module) => module.PlanTimeline),
	{
		loading: () => (
			<Card.Root variant="outline">
				<Card.Body>
					<Text color="fg.subtle">タイムラインを読み込んでいます。</Text>
				</Card.Body>
			</Card.Root>
		),
		ssr: false,
	},
);

export const PlanTimelineLazy = ({
	editable = false,
	plan,
	recipeTitleById,
}: {
	editable?: boolean;
	plan: PlanDocument;
	recipeTitleById: Record<string, string>;
}) => <PlanTimeline editable={editable} plan={plan} recipeTitleById={recipeTitleById} />;
