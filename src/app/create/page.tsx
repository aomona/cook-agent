import { Button, Flex, Text } from '@workspaces/ui';

export default function Create() {
	return (
		<Flex align="center" h="full" justify="center" px="md">
			<Flex align="start" direction="column" gap="md" maxW="4xl" textAlign="left" w="full">
				<Text fontSize="xl">urlまたはテキストから、レシピの計画を生成します。</Text>
				<Text color="GrayText">ここにレシピが追加されます</Text>
				<Flex justify="end" w="full">
					<Button variant="solid">レシピを追加</Button>
				</Flex>
			</Flex>
		</Flex>
	);
}
