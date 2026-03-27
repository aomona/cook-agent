import { Box } from '@workspaces/ui';

export const AppSpinner = ({ size = '1.25rem' }: { size?: string }) => (
	<Box
		aria-hidden="true"
		className="app-spinner"
		display="inline-block"
		height={size}
		width={size}
	/>
);
