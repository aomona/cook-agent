import { Card, Flex, Text } from '@workspaces/ui';
import { AppSpinner } from '@/components/app-spinner';

export default function PlanEditLoading() {
	return (
		<Flex align="center" justify="center" minH="100vh" px="md" py="xl">
			<Card.Root maxW="4xl" variant="outline" w="full">
				<Card.Body alignItems="center" gap="sm" p="xl">
					<AppSpinner />
					<Text fontWeight="semibold">工程エディタを読み込んでいます</Text>
				</Card.Body>
			</Card.Root>
		</Flex>
	);
}
