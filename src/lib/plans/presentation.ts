import type { RecipeProcessingStatus } from '@/lib/plans/types';

export const formatPlanDateTime = (value: string): string =>
	new Intl.DateTimeFormat('ja-JP', {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
	}).format(new Date(value));

export const getPlanStatusColorScheme = (status: 'draft' | 'ready' | 'archived'): string => {
	if (status === 'ready') return 'green';
	if (status === 'archived') return 'gray';

	return 'blue';
};

export const getPlanStatusLabel = (status: 'draft' | 'ready' | 'archived'): string => {
	if (status === 'ready') return 'READY';
	if (status === 'archived') return 'ARCHIVED';

	return 'DRAFT';
};

export const getRecipeProcessingLabel = (status: RecipeProcessingStatus): string => {
	if (status === 'completed') return '抽出完了';
	if (status === 'failed') return '抽出失敗';
	if (status === 'queued') return '抽出待機中';

	return '抽出中';
};
