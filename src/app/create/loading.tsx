import { Card, Flex, Loading, Text, VStack } from '@workspaces/ui';

export default function CreateLoading() {
	return (
		<Flex align="center" justify="center" minH="100vh" px="md" py="xl">
			<Card.Root maxW="xl" variant="outline" w="full">
				<Card.Body gap="md" p="xl">
					<Flex align="center" gap="sm">
						<Loading.Oval color="blue.500" fontSize="lg" />
						<Text fontWeight="semibold">作成中の計画を読み込んでいます</Text>
					</Flex>
					<VStack align="stretch" gap="xs">
						<Text color="fg.subtle">レシピ一覧と進行状況を準備しています。</Text>
					</VStack>
				</Card.Body>
			</Card.Root>
		</Flex>
	);
}
