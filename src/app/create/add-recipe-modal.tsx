'use client';

import { Button, Input, Modal, SegmentedControl, Text, Textarea, VStack } from '@workspaces/ui';
import type { RecipeInputMode } from '@/lib/create-session';

const recipeInputModeItems: { label: string; value: RecipeInputMode }[] = [
	{ label: 'URL', value: 'url' },
	{ label: 'Text', value: 'text' },
];

export const AddRecipeModal = ({
	mode,
	open,
	textValue,
	urlValue,
	onClose,
	onModeChange,
	onSubmit,
	onTextChange,
	onUrlChange,
}: {
	mode: RecipeInputMode;
	open: boolean;
	textValue: string;
	urlValue: string;
	onClose: () => void;
	onModeChange: (value: RecipeInputMode) => void;
	onSubmit: () => void;
	onTextChange: (value: string) => void;
	onUrlChange: (value: string) => void;
}) => (
	<Modal.Root open={open} size="lg" onClose={onClose}>
		<Modal.Overlay backdropFilter="blur(4px)" />
		<Modal.Content mx="md" w="calc(100% - 2rem)">
			<Modal.Header px="lg" pt="lg">
				<Modal.Title>レシピを追加</Modal.Title>
			</Modal.Header>

			<Modal.Body px="lg" py="md">
				<VStack align="stretch" gap="md">
					<SegmentedControl.Root
						items={recipeInputModeItems}
						value={mode}
						onChange={(value) => onModeChange(value as RecipeInputMode)}
					/>

					{mode === 'url' ? (
						<VStack align="stretch" gap="sm">
							<Text fontWeight="medium">URL</Text>
							<Input
								aria-label="レシピURL"
								placeholder="https://example.com/recipe"
								value={urlValue}
								onChange={(event) => onUrlChange(event.target.value)}
							/>
						</VStack>
					) : (
						<VStack align="stretch" gap="sm">
							<Text fontWeight="medium">Text</Text>
							<Textarea
								aria-label="レシピテキスト"
								autosize
								minH="9rem"
								placeholder="材料や手順のメモを貼り付けてください"
								value={textValue}
								onChange={(event) => onTextChange(event.target.value)}
							/>
						</VStack>
					)}
				</VStack>
			</Modal.Body>

			<Modal.Footer px="lg" pb="lg" pt="sm">
				<Button variant="ghost" onClick={onClose}>
					閉じる
				</Button>
				<Button onClick={onSubmit}>追加する</Button>
			</Modal.Footer>
		</Modal.Content>
	</Modal.Root>
);
