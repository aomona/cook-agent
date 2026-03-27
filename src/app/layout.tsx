import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { cookies } from 'next/headers';
import 'react-calendar-timeline/style.css';
import './globals.css';
import { Box, ColorModeScript, defineConfig, UIProvider } from '@workspaces/ui';

const uiConfig = defineConfig({
	defaultColorMode: 'system',
});

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

	return (
		<html lang="ja" suppressHydrationWarning>
			<body suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable}`}>
				<ColorModeScript defaultValue={uiConfig.defaultColorMode} type="cookie" />
				<UIProvider config={uiConfig} cookie={cookieStore.toString()} storage="cookie">
					<Box as="main" h="full">
						{children}
					</Box>
				</UIProvider>
			</body>
		</html>
	);
}
