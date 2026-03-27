import { Button, Card, Flex, Text, VStack } from '@workspaces/ui';
import NextLink from 'next/link';

export default function PlanNotFound() {
	return (
		<Flex align="center" justify="center" minH="100vh" px="md" py="xl">
			<Card.Root maxW="3xl" variant="outline" w="full">
				<Card.Body gap="md" p="xl">
					<VStack align="stretch" gap="xs">
						<Text fontSize="lg" fontWeight="semibold">
							計画が見つかりません
						</Text>
						<Text color="fg.subtle">
							削除されたか、アクセス権のない計画を開こうとした可能性があります。
						</Text>
					</VStack>
					<Button as={NextLink} href="/" alignSelf="start">
						一覧に戻る
					</Button>
				</Card.Body>
			</Card.Root>
		</Flex>
	);
}
