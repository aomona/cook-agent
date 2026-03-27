'use client';

import { Button, Card, Flex, Heading, Input, Text, useNotice, VStack } from '@workspaces/ui';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { CreatePlanData } from '@/lib/create-session';
import { updateRequestedServingsAction } from '../actions';

const getErrorMessage = (error: unknown): string => {
	if (error instanceof Error && error.message) {
		return error.message;
	}

	return '人数を保存できませんでした。';
};

export const ServingsPageClient = ({ initialPlan }: { initialPlan: CreatePlanData }) => {
	const notice = useNotice();
	const router = useRouter();
	const [requestedServings, setRequestedServings] = useState(
		initialPlan.requestedServings?.toString() ?? '2',
	);
	const [isSaving, setIsSaving] = useState(false);

	const handleSubmit = async (): Promise<void> => {
		const parsedServings = Number.parseInt(requestedServings.trim(), 10);

		if (Number.isNaN(parsedServings) || parsedServings < 1 || parsedServings > 24) {
			notice({
				description: '1 から 24 の人数を入力してください。',
				status: 'error',
				title: '入力エラー',
			});
			return;
		}

		setIsSaving(true);

		try {
			await updateRequestedServingsAction({
				planId: initialPlan.id,
				requestedServings: parsedServings,
			});
			router.push('/create');
			router.refresh();
		} catch (error) {
			notice({
				description: getErrorMessage(error),
				status: 'error',
				title: '人数を保存できませんでした',
			});
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<Flex align="center" h="full" justify="center" px="md" py="xl">
			<VStack align="stretch" gap="lg" maxW="xl" w="full">
				<Flex justify="start">
					<Button as={NextLink} href="/" variant="ghost">
						戻る
					</Button>
				</Flex>

				<VStack align="stretch" gap="xs">
					<Heading size="xl">人数を入力してください</Heading>
					<Text color="fg.subtle">
						先に人数を決めると、レシピ抽出後にその人数向けの材料と手順へ自動で調整できます。
					</Text>
				</VStack>

				<Card.Root variant="outline">
					<Card.Body gap="md" p="lg">
						<VStack align="stretch" gap="sm">
							<Text fontWeight="medium">作る人数</Text>
							<Input
								min={1}
								max={24}
								type="number"
								value={requestedServings}
								onChange={(event) => setRequestedServings(event.target.value)}
							/>
							<Text color="fg.subtle" fontSize="sm">
								URL 登録後は、この人数を前提に AI が手順文の分量・火加減・時間感まで調整します。
							</Text>
						</VStack>

						{initialPlan.recipes.length > 0 ? (
							<Text color="fg.subtle" fontSize="sm">
								人数を変更すると、登録済みレシピ {initialPlan.recipes.length}{' '}
								件をこの人数向けに再調整します。
							</Text>
						) : null}
					</Card.Body>
				</Card.Root>

				<Flex justify="end">
					<Button loading={isSaving} onClick={() => void handleSubmit()} variant="solid">
						次へ
					</Button>
				</Flex>
			</VStack>
		</Flex>
	);
};
