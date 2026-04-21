'use client';

import { Button, Card, Flex, Text, VStack } from '@workspaces/ui';
import { useEffect } from 'react';

export default function CreateError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		console.error(error);
	}, [error]);

	return (
		<Flex align="center" justify="center" minH="100vh" px="md" py="xl">
			<Card.Root maxW="xl" variant="outline" w="full">
				<Card.Body gap="md" p="xl">
					<VStack align="stretch" gap="xs">
						<Text fontSize="lg" fontWeight="semibold">
							作成フローを表示できませんでした
						</Text>
						<Text color="fg.subtle">
							一時的な問題の可能性があります。再読み込みでも直らない場合は、一覧に戻って計画を開き直してください。
						</Text>
					</VStack>
					<Button alignSelf="start" onClick={reset}>
						再試行
					</Button>
				</Card.Body>
			</Card.Root>
		</Flex>
	);
}
