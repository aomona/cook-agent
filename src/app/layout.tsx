import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { cookies, headers } from 'next/headers';
import './globals.css';
import { Box, ColorModeScript, defineConfig, UIProvider } from '@workspaces/ui';
import { AppHeader } from '@/components/app-header';
import { PlanningSettingsProvider } from '@/components/planning-settings-provider';
import { auth } from '@/lib/auth';
import { createDefaultPlanningSettings } from '@/lib/planning-settings';
import { getUserPlanningSettingsState } from '@/lib/planning-settings-queries';

const uiConfig = defineConfig({
	defaultColorMode: 'system',
});

const uiStorageCookieKeys = [
	'color-mode',
	'default-color-mode',
	'theme-scheme',
	'default-theme-scheme',
] as const;

const getUiStorageCookieHeader = (
	cookieStore: Awaited<ReturnType<typeof cookies>>,
): string | undefined => {
	const uiCookies = uiStorageCookieKeys.flatMap((key) => {
		const value = cookieStore.get(key)?.value;

		return value ? [`${key}=${value}`] : [];
	});

	return uiCookies.length > 0 ? uiCookies.join('; ') : undefined;
};

const geistSans = Geist({
	variable: '--font-geist-sans',
	subsets: ['latin'],
});

const geistMono = Geist_Mono({
	variable: '--font-geist-mono',
	subsets: ['latin'],
});

export const metadata: Metadata = {
	title: 'Cook Agent',
	description: 'レシピから調理計画を生成し、実行可能な工程に落とし込むプロトタイプです。',
};

export default async function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	const cookieStore = await cookies();
	const uiCookie = getUiStorageCookieHeader(cookieStore);
	const session = await auth.api.getSession({ headers: await headers() });
	const initialPlanningSettingsState = session
		? await getUserPlanningSettingsState(session.user.id)
		: {
				hasSavedSettings: false,
				settings: createDefaultPlanningSettings(),
			};

	return (
		<html lang="ja" suppressHydrationWarning>
			<body suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable}`}>
				<ColorModeScript defaultValue={uiConfig.defaultColorMode} type="cookie" />
				<UIProvider config={uiConfig} cookie={uiCookie} storage="cookie">
					<PlanningSettingsProvider initialState={initialPlanningSettingsState}>
						{session && <AppHeader />}
						<Box as="main" h="full">
							{children}
						</Box>
					</PlanningSettingsProvider>
				</UIProvider>
			</body>
		</html>
	);
}
