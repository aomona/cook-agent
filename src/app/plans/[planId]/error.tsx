'use client';

import { Button, Card, Flex, Text, VStack } from '@workspaces/ui';
import NextLink from 'next/link';
import { useEffect } from 'react';

export default function PlanError({
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
			<Card.Root maxW="3xl" variant="outline" w="full">
				<Card.Body gap="md" p="xl">
					<VStack align="stretch" gap="xs">
						<Text fontSize="lg" fontWeight="semibold">
							計画を表示できませんでした
						</Text>
						<Text color="fg.subtle">
							データの取得か描画で問題が起きました。再試行するか、一覧から開き直してください。
						</Text>
					</VStack>
					<Flex gap="sm" wrap="wrap">
						<Button onClick={reset}>再試行</Button>
						<Button as={NextLink} href="/" variant="ghost">
							一覧に戻る
						</Button>
					</Flex>
				</Card.Body>
			</Card.Root>
		</Flex>
	);
}
