'use client';

import { Button, Modal, Text, useDisclosure, useNotice, VStack } from '@workspaces/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const getErrorMessage = (error: unknown): string => {
	if (error instanceof Error && error.message) {
		return error.message;
	}

	return '計画の削除に失敗しました。';
};

export const DeletePlanButton = ({ planId }: { planId: string }) => {
	const { open, onClose, onOpen } = useDisclosure();
	const [isDeleting, setIsDeleting] = useState(false);
	const notice = useNotice();
	const router = useRouter();

	const handleDelete = async (): Promise<void> => {
		setIsDeleting(true);

		try {
			const response = await fetch(`/api/plans/${planId}`, {
				method: 'DELETE',
			});

			if (!response.ok) {
				const payload = (await response.json().catch(() => null)) as { message?: string } | null;
				throw new Error(payload?.message ?? '計画の削除に失敗しました。');
			}

			notice({
				description: '計画を削除しました。',
				status: 'success',
				title: '削除完了',
			});
			router.push('/');
			router.refresh();
		} catch (error) {
			notice({
				description: getErrorMessage(error),
				status: 'error',
				title: '計画を削除できませんでした',
			});
		} finally {
			setIsDeleting(false);
			onClose();
		}
	};

	return (
		<>
			<Button colorScheme="red" variant="outline" onClick={onOpen}>
				削除
			</Button>

			<Modal.Root open={open} size="md" onClose={onClose}>
				<Modal.Overlay backdropFilter="blur(4px)" />
				<Modal.Content mx="md" w="calc(100% - 2rem)">
					<Modal.Header px="lg" pt="lg">
						<Modal.Title>この計画を削除しますか？</Modal.Title>
					</Modal.Header>

					<Modal.Body px="lg" py="md">
						<VStack align="stretch" gap="sm">
							<Text>この操作は取り消せません。関連するレシピの抽出結果も一緒に削除されます。</Text>
						</VStack>
					</Modal.Body>

					<Modal.Footer px="lg" pb="lg" pt="sm">
						<Button variant="ghost" onClick={onClose}>
							キャンセル
						</Button>
						<Button colorScheme="red" loading={isDeleting} onClick={() => void handleDelete()}>
							削除する
						</Button>
					</Modal.Footer>
				</Modal.Content>
			</Modal.Root>
		</>
	);
};
