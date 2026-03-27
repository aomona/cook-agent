import { Card, Flex, Loading, Text } from '@workspaces/ui';

export default function PlanEditLoading() {
	return (
		<Flex align="center" justify="center" minH="100vh" px="md" py="xl">
			<Card.Root maxW="4xl" variant="outline" w="full">
				<Card.Body alignItems="center" gap="sm" p="xl">
					<Loading.Oval color="blue.500" fontSize="lg" />
					<Text fontWeight="semibold">工程エディタを読み込んでいます</Text>
				</Card.Body>
			</Card.Root>
		</Flex>
	);
}
