'use client';

import { useNotice } from '@workspaces/ui';
import { useRouter } from 'next/navigation';
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import type { PlanningSettings } from '@/lib/planning-settings';
import { SettingsDrawer } from './settings-drawer';

type PlanningSettingsProviderState = {
	hasSavedSettings: boolean;
	settings: PlanningSettings;
};

type PlanningSettingsContextValue = PlanningSettingsProviderState & {
	closeDrawer: () => void;
	isDrawerOpen: boolean;
	isSaving: boolean;
	openDrawer: () => void;
	saveSettings: (settings: PlanningSettings) => Promise<void>;
};

const PlanningSettingsContext = createContext<PlanningSettingsContextValue | null>(null);

export const PlanningSettingsProvider = ({
	children,
	initialState,
}: {
	children: ReactNode;
	initialState: PlanningSettingsProviderState;
}) => {
	const notice = useNotice();
	const router = useRouter();
	const [hasSavedSettings, setHasSavedSettings] = useState(initialState.hasSavedSettings);
	const [settings, setSettings] = useState(initialState.settings);
	const [isDrawerOpen, setIsDrawerOpen] = useState(false);
	const [isSaving, setIsSaving] = useState(false);

	const openDrawer = useCallback(() => {
		setIsDrawerOpen(true);
	}, []);

	const closeDrawer = useCallback(() => {
		setIsDrawerOpen(false);
	}, []);

	const saveSettings = useCallback(
		async (nextSettings: PlanningSettings): Promise<void> => {
			setIsSaving(true);

			try {
				const response = await fetch('/api/planning-settings', {
					method: 'PUT',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ settings: nextSettings }),
				});

				if (!response.ok) {
					const payload = (await response.json().catch(() => null)) as { message?: string } | null;
					throw new Error(payload?.message ?? '設定の保存に失敗しました。');
				}

				const payload = (await response.json()) as PlanningSettingsProviderState;
				setHasSavedSettings(payload.hasSavedSettings);
				setSettings(payload.settings);
				setIsDrawerOpen(false);
				router.refresh();
				notice({
					description: '次回の工程生成にも同じ条件を使います。',
					status: 'success',
					title: '設定を保存しました',
				});
			} catch (error) {
				notice({
					description:
						error instanceof Error && error.message ? error.message : '設定の保存に失敗しました。',
					status: 'error',
					title: '保存できませんでした',
				});
				throw error;
			} finally {
				setIsSaving(false);
			}
		},
		[notice, router],
	);

	const value = useMemo<PlanningSettingsContextValue>(
		() => ({
			closeDrawer,
			hasSavedSettings,
			isDrawerOpen,
			isSaving,
			openDrawer,
			saveSettings,
			settings,
		}),
		[closeDrawer, hasSavedSettings, isDrawerOpen, isSaving, openDrawer, saveSettings, settings],
	);

	return (
		<PlanningSettingsContext.Provider value={value}>
			{children}
			<SettingsDrawer
				hasSavedSettings={hasSavedSettings}
				isSaving={isSaving}
				onClose={closeDrawer}
				onSave={saveSettings}
				open={isDrawerOpen}
				settings={settings}
			/>
		</PlanningSettingsContext.Provider>
	);
};

export const usePlanningSettings = (): PlanningSettingsContextValue => {
	const context = useContext(PlanningSettingsContext);

	if (!context) {
		throw new Error('usePlanningSettings must be used within PlanningSettingsProvider.');
	}

	return context;
};
