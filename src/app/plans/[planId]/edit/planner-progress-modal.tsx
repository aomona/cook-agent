'use client';

import { Box, Button, Flex, Modal, Text, useColorModeValue, VStack } from '@workspaces/ui';
import type { RefObject } from 'react';
import { AppSpinner } from '@/components/app-spinner';

const STATUS_DISPLAY_COUNT = 6;

export const PlannerProgressModal = ({
	isGenerating,
	open,
	progressLogs,
	progressTitle,
	reasoningEndRef,
	reasoningText,
	statusEndRef,
	onClose,
}: {
	isGenerating: boolean;
	open: boolean;
	progressLogs: string[];
	progressTitle: string;
	reasoningEndRef: RefObject<HTMLDivElement | null>;
	reasoningText: string;
	statusEndRef: RefObject<HTMLDivElement | null>;
	onClose: () => void;
}) => {
	const overlayBackground = useColorModeValue('blackAlpha.400', 'blackAlpha.700');
	const recentLogs = progressLogs.slice(-STATUS_DISPLAY_COUNT);
	const seenLogs = new Map<string, number>();
	const recentLogEntries = recentLogs.map((log) => {
		const occurrence = (seenLogs.get(log) ?? 0) + 1;
		seenLogs.set(log, occurrence);

		return {
			key: `${log}-${occurrence}`,
			log,
		};
	});

	return (
		<Modal.Root
			autoFocus={false}
			closeOnEsc={false}
			closeOnOverlay={false}
			open={open}
			restoreFocus={false}
			withCloseButton={!isGenerating}
			onClose={() => {
				if (!isGenerating) {
					onClose();
				}
			}}
		>
			<Modal.Overlay backdropFilter="blur(6px)" bg={overlayBackground} />
			<Modal.Content
				maxH="72vh"
				mt="8vh"
				mx="auto"
				overflow="hidden"
				w="min(48rem, calc(100% - 2rem))"
			>
				<Modal.Header px="lg" pt="lg" pb="sm">
					<Flex align="center" gap="sm" w="full">
						{isGenerating ? <AppSpinner /> : null}
						<Modal.Title>{progressTitle}</Modal.Title>
					</Flex>
				</Modal.Header>

				<Modal.Body px="lg" pt="sm" pb="md" overflowY="auto">
					<VStack align="stretch" gap="md">
						<VStack align="stretch" gap="xs">
							<Text color="fg.subtle" fontSize="xs" fontWeight="semibold" letterSpacing="wider">
								推論
							</Text>
							<Box bg="bg.subtle" borderRadius="md" maxH="38vh" overflowY="auto" p="md">
								<Text
									className={isGenerating ? 'plan-reasoning-streaming' : undefined}
									color={reasoningText ? undefined : 'fg.muted'}
									fontSize="sm"
									lineHeight="tall"
									whiteSpace="pre-wrap"
								>
									{reasoningText || '推論の要約がここに流れます...'}
								</Text>
								<div ref={reasoningEndRef} />
							</Box>
						</VStack>

						<VStack align="stretch" gap="xs">
							<Text color="fg.subtle" fontSize="xs" fontWeight="semibold" letterSpacing="wider">
								ステータス
							</Text>
							<VStack align="stretch" gap="xs">
								{recentLogEntries.map(({ key, log }, index) => {
									const isLatest = index === recentLogs.length - 1;
									return (
										<Flex key={key} align="center" gap="sm">
											<Box
												borderRadius="full"
												className={isLatest && isGenerating ? 'plan-status-dot-active' : undefined}
												bg={isLatest ? 'blue.400' : 'fg.subtle'}
												flexShrink={0}
												h="0.375rem"
												opacity={isLatest ? 1 : 0.3}
												w="0.375rem"
											/>
											<Text
												color={isLatest ? 'fg.default' : 'fg.subtle'}
												fontFamily="mono"
												fontSize="xs"
												opacity={isLatest ? 1 : 0.55}
											>
												{log}
											</Text>
										</Flex>
									);
								})}
								<div ref={statusEndRef} />
							</VStack>
						</VStack>
					</VStack>
				</Modal.Body>

				{isGenerating ? null : (
					<Modal.Footer px="lg" pb="lg" pt="sm">
						<Button onClick={onClose} variant="solid">
							閉じる
						</Button>
					</Modal.Footer>
				)}
			</Modal.Content>
		</Modal.Root>
	);
};
