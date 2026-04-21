import { Button, Card, Flex, Heading, Text, VStack } from '@workspaces/ui';
import NextLink from 'next/link';

export const CreateStartPrompt = ({
	description,
	title,
}: {
	description: string;
	title: string;
}) => {
	return (
		<Flex align="center" justify="center" minH="100vh" px="md" py="xl">
			<Card.Root maxW="xl" w="full" variant="outline">
				<Card.Body gap="lg" p="xl">
					<VStack align="stretch" gap="xs">
						<Heading size="lg">{title}</Heading>
						<Text color="fg.subtle">{description}</Text>
					</VStack>
					<Flex justify="space-between" gap="sm" wrap="wrap">
						<Button as={NextLink} href="/" variant="ghost">
							一覧に戻る
						</Button>
						<form action="/create/start" method="post">
							<Button type="submit" variant="solid">
								新しい計画を開始
							</Button>
						</form>
					</Flex>
				</Card.Body>
			</Card.Root>
		</Flex>
	);
};
