import { Card, Flex, Text, VStack } from '@workspaces/ui';
import { AppSpinner } from '@/components/app-spinner';

export default function PlanLoading() {
	return (
		<Flex align="center" justify="center" minH="100vh" px="md" py="xl">
			<Card.Root maxW="3xl" variant="outline" w="full">
				<Card.Body gap="md" p="xl">
					<Flex align="center" gap="sm">
						<AppSpinner />
						<Text fontWeight="semibold">計画を読み込んでいます</Text>
					</Flex>
					<VStack align="stretch" gap="xs">
						<Text color="fg.subtle">レシピ、材料、工程タイムラインを準備しています。</Text>
					</VStack>
				</Card.Body>
			</Card.Root>
		</Flex>
	);
}
