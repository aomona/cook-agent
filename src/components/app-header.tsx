'use client';

import {
	Avatar,
	Box,
	Flex,
	MenuContent,
	MenuItem,
	MenuRoot,
	MenuTrigger,
	Text,
} from '@workspaces/ui';
import { signOut, useSession } from '@/lib/auth-client';
import { usePlanningSettings } from './planning-settings-provider';

export const AppHeader = () => {
	const session = useSession();
	const { openDrawer } = usePlanningSettings();

	return (
		<Box
			as="header"
			borderBottomWidth="1px"
			borderColor="border.muted"
			bg="bg"
			position="sticky"
			top={0}
			zIndex="sticky"
			px="lg"
			py="sm"
		>
			<Flex align="center" justify="space-between" maxW="7xl" mx="auto">
				{/* Wordmark */}
				<Flex align="baseline" gap="1">
					<Text as="span" fontWeight="black" fontSize="xl" letterSpacing="tighter" color="fg">
						cook
					</Text>
					<Text
						as="span"
						fontWeight="light"
						fontSize="xs"
						color="fg.subtle"
						textTransform="uppercase"
						style={{ marginLeft: '0.25em', letterSpacing: '0.2em' }}
					>
						agent
					</Text>
				</Flex>

				{/* User menu */}
				{session?.data?.user && (
					<MenuRoot>
						<MenuTrigger
							p={0}
							h="auto"
							minW="auto"
							rounded="full"
							bg="transparent"
							border="none"
							_hover={{ opacity: 0.8 }}
						>
							<Avatar
								name={session.data.user.name ?? ''}
								src={session.data.user.image ?? undefined}
								size="sm"
							/>
						</MenuTrigger>
						<MenuContent>
							<Box px="md" py="xs" borderBottomWidth="1px" borderColor="border.muted" mb="xs">
								<Text fontWeight="medium" fontSize="sm" lineClamp={1}>
									{session.data.user.name}
								</Text>
								<Text fontSize="xs" color="fg.subtle" lineClamp={1}>
									{session.data.user.email}
								</Text>
							</Box>
							<MenuItem onClick={openDrawer}>工程設定</MenuItem>
							<MenuItem color="red.500" onClick={() => void signOut()}>
								ログアウト
							</MenuItem>
						</MenuContent>
					</MenuRoot>
				)}
			</Flex>
		</Box>
	);
};
