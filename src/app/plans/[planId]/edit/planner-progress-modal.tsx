'use client';

import { Button, Card, Flex, For, Modal, Text, VStack } from '@workspaces/ui';
import type { RefObject } from 'react';
import { AppSpinner } from '@/components/app-spinner';

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
}) => (
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
		<Modal.Overlay backdropFilter="blur(6px)" bg="blackAlpha.400" />
		<Modal.Content
			maxH="42vh"
			mt="4vh"
			mx="auto"
			overflow="hidden"
			w="min(42rem, calc(100% - 2rem))"
		>
			<Modal.Header px="lg" pt="lg">
				<Flex align="center" gap="sm" justify="space-between" w="full">
					<VStack align="stretch" gap="xs">
						<Modal.Title>{progressTitle}</Modal.Title>
						<Text color="fg.subtle" fontSize="sm">
							{isGenerating
								? '推論の要約をリアルタイム表示しています。'
								: '生成ログを確認できます。'}
						</Text>
					</VStack>
					{isGenerating ? <AppSpinner /> : null}
				</Flex>
			</Modal.Header>
			<Modal.Body px="lg" py="md">
				<VStack align="stretch" gap="sm">
					<Card.Root bg="bg.subtle" variant="outline">
						<Card.Body gap="sm" maxH="20vh" overflowY="auto">
							<Text color="fg.subtle" fontSize="sm" fontWeight="semibold">
								Reasoning
							</Text>
							<Text fontFamily="mono" fontSize="sm" whiteSpace="pre-wrap">
								{reasoningText || '推論の要約がここに流れます。'}
							</Text>
							<div ref={reasoningEndRef} />
						</Card.Body>
					</Card.Root>
					<Card.Root bg="bg.muted" variant="outline">
						<Card.Body gap="xs" maxH="10vh" overflowY="auto">
							<Text color="fg.subtle" fontSize="sm" fontWeight="semibold">
								Status
							</Text>
							<For each={progressLogs}>
								{(log, index) => (
									<Text key={`${log}-${index}`} fontFamily="mono" fontSize="xs">
										{log}
									</Text>
								)}
							</For>
							<div ref={statusEndRef} />
						</Card.Body>
					</Card.Root>
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
