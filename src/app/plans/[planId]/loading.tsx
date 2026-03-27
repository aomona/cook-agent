import { Card, Flex, Loading, Text, VStack } from '@workspaces/ui';

export default function PlanLoading() {
	return (
		<Flex align="center" justify="center" minH="100vh" px="md" py="xl">
			<Card.Root maxW="3xl" variant="outline" w="full">
				<Card.Body gap="md" p="xl">
					<Flex align="center" gap="sm">
						<Loading.Oval color="blue.500" fontSize="lg" />
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
