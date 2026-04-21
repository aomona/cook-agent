'use client';

import {
	type FunctionCall,
	GoogleGenAI,
	type LiveConnectConfig,
	type LiveServerMessage,
	type Session,
} from '@google/genai';
import { startTransition, useEffect, useEffectEvent, useRef, useState } from 'react';
import type { CookSessionSnapshot } from '@/lib/cook-runtime/types';
import { useAudioPlaybackQueue } from './use-audio-playback-queue';
import { useLiveMicrophone } from './use-live-microphone';

export type RuntimeTranscriptEntry = {
	id: string;
	role: 'assistant' | 'status' | 'tool' | 'user';
	text: string;
	createdAt: number;
};

type ConnectionState = 'connected' | 'connecting' | 'disconnected' | 'error' | 'idle';

type LiveSessionPayload = {
	token: string;
	model: string;
	config: LiveConnectConfig;
};

const buildTranscriptId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const appendTranscriptEntry = (
	entries: RuntimeTranscriptEntry[],
	entry: Omit<RuntimeTranscriptEntry, 'createdAt' | 'id'>,
): RuntimeTranscriptEntry[] =>
	[
		...entries,
		{
			...entry,
			createdAt: Date.now(),
			id: buildTranscriptId(),
		},
	].slice(-40);

export const useCookLiveSession = ({
	planId,
	onSnapshot,
}: {
	planId: string;
	onSnapshot: (snapshot: CookSessionSnapshot) => void;
}) => {
	const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
	const [latestError, setLatestError] = useState<string | null>(null);
	const [transcriptEntries, setTranscriptEntries] = useState<RuntimeTranscriptEntry[]>([]);
	const sessionRef = useRef<Session | null>(null);
	const sessionIdRef = useRef<string | null>(null);
	const disconnectRequestedRef = useRef(false);
	const resumptionHandleRef = useRef<string | null>(null);
	const toolCallQueueRef = useRef(Promise.resolve());

	const appendEntry = (entry: Omit<RuntimeTranscriptEntry, 'createdAt' | 'id'>) => {
		setTranscriptEntries((currentEntries) => appendTranscriptEntry(currentEntries, entry));
	};
	const { clearPlaybackQueue, disposePlayback, initializePlayback, queuePlayback } =
		useAudioPlaybackQueue();
	const { microphoneState, startMicrophone, stopMicrophone } = useLiveMicrophone({
		getSession: () => sessionRef.current,
		onError: (message) => {
			setLatestError(message);
			appendEntry({ role: 'status', text: 'マイクを開始できませんでした。' });
		},
		onStarted: () => {
			appendEntry({ role: 'status', text: 'マイクを有効にしました。話しかけてください。' });
		},
		onStopped: () => undefined,
	});

	const refreshSnapshot = async () => {
		const response = await fetch(`/api/plans/${planId}/cook/session`, {
			cache: 'no-store',
		});
		const payload = (await response.json()) as {
			message?: string;
			snapshot?: CookSessionSnapshot;
		};

		if (!response.ok || !payload.snapshot) {
			throw new Error(payload.message ?? '調理セッションの同期に失敗しました。');
		}

		sessionIdRef.current = payload.snapshot.session?.id ?? null;
		startTransition(() => {
			onSnapshot(payload.snapshot as CookSessionSnapshot);
		});
	};

	const disconnect = async () => {
		disconnectRequestedRef.current = true;
		await stopMicrophone();
		clearPlaybackQueue();
		sessionRef.current?.close();
		sessionRef.current = null;
		await disposePlayback();
		setConnectionState('disconnected');
		appendEntry({ role: 'status', text: '音声接続を終了しました。' });
	};

	const handleToolCalls = async (functionCalls: FunctionCall[]) => {
		const session = sessionRef.current;

		if (!session) {
			return;
		}

		const functionResponses: {
			id: string;
			name: string;
			response: { result?: unknown; error?: boolean; message?: string };
		}[] = [];

		for (const functionCall of functionCalls) {
			if (!functionCall.name || !functionCall.id) {
				continue;
			}

			appendEntry({ role: 'tool', text: `補助ツール実行: ${functionCall.name}` });

			try {
				const response = await fetch(`/api/plans/${planId}/cook/tool`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						args: functionCall.args ?? {},
						sessionId: sessionIdRef.current ?? undefined,
						toolName: functionCall.name,
					}),
				});
				const payload = (await response.json()) as { message?: string; result?: unknown };

				if (!response.ok) {
					functionResponses.push({
						id: functionCall.id,
						name: functionCall.name,
						response: {
							error: true,
							message: payload.message ?? `Tool failed: ${functionCall.name}`,
						},
					});
				} else {
					functionResponses.push({
						id: functionCall.id,
						name: functionCall.name,
						response: {
							result: payload.result ?? null,
						},
					});
				}
			} catch (error) {
				functionResponses.push({
					id: functionCall.id,
					name: functionCall.name,
					response: {
						error: true,
						message: error instanceof Error ? error.message : `Tool failed: ${functionCall.name}`,
					},
				});
			}
		}

		session.sendToolResponse({ functionResponses });

		try {
			await refreshSnapshot();
		} catch {
			// Best-effort refresh, do not prevent sending tool responses
		}
	};

	const enqueueToolCalls = (functionCalls: FunctionCall[]) => {
		toolCallQueueRef.current = toolCallQueueRef.current
			.catch(() => undefined)
			.then(async () => {
				await handleToolCalls(functionCalls);
			})
			.catch((error) => {
				const message = error instanceof Error ? error.message : 'Tool failed.';
				setLatestError(message);
				appendEntry({ role: 'status', text: `補助ツール実行エラー: ${message}` });
			});
	};

	const handleMessage = (message: LiveServerMessage) => {
		if (message.sessionResumptionUpdate?.resumable && message.sessionResumptionUpdate.newHandle) {
			resumptionHandleRef.current = message.sessionResumptionUpdate.newHandle;
		}

		if (message.toolCall?.functionCalls?.length) {
			enqueueToolCalls(message.toolCall.functionCalls);
		}

		if (message.serverContent?.interrupted) {
			clearPlaybackQueue();
		}

		if (message.serverContent?.inputTranscription?.text) {
			appendEntry({ role: 'user', text: message.serverContent.inputTranscription.text });
		}

		if (message.serverContent?.outputTranscription?.text) {
			appendEntry({ role: 'assistant', text: message.serverContent.outputTranscription.text });
		}

		for (const part of message.serverContent?.modelTurn?.parts ?? []) {
			if (part.inlineData?.data) {
				queuePlayback(part.inlineData.data);
			}
		}
	};

	const connect = async () => {
		if (connectionState === 'connecting' || connectionState === 'connected') {
			return;
		}

		setConnectionState('connecting');
		setLatestError(null);
		disconnectRequestedRef.current = false;

		try {
			const response = await fetch(`/api/plans/${planId}/cook/live`, {
				method: 'POST',
			});
			const payload = (await response.json()) as {
				message?: string;
				config?: LiveSessionPayload['config'];
				model?: string;
				token?: string;
			};

			if (!response.ok || !payload.token || !payload.model || !payload.config) {
				throw new Error(payload.message ?? 'Live session の準備に失敗しました。');
			}

			await refreshSnapshot();

			await initializePlayback();

			const ai = new GoogleGenAI({
				apiKey: payload.token,
				httpOptions: { apiVersion: 'v1alpha' },
			});
			const config = {
				...payload.config,
				sessionResumption: resumptionHandleRef.current
					? { handle: resumptionHandleRef.current }
					: payload.config.sessionResumption,
			};

			const session = await ai.live.connect({
				model: payload.model,
				config,
				callbacks: {
					onopen: () => {
						setConnectionState('connected');
						appendEntry({ role: 'status', text: 'Gemini Live に接続しました。' });
					},
					onmessage: handleMessage,
					onerror: (error) => {
						setConnectionState('error');
						setLatestError(error.message);
						appendEntry({ role: 'status', text: `接続エラー: ${error.message}` });
					},
					onclose: () => {
						sessionRef.current = null;
						void stopMicrophone();
						clearPlaybackQueue();
						setConnectionState(disconnectRequestedRef.current ? 'disconnected' : 'idle');
						appendEntry({ role: 'status', text: 'Gemini Live との接続が閉じられました。' });
					},
				},
			});

			sessionRef.current = session;
		} catch (error) {
			setConnectionState('error');
			setLatestError(
				error instanceof Error ? error.message : 'Live session の接続に失敗しました。',
			);
			appendEntry({ role: 'status', text: 'Live session の接続に失敗しました。' });
		}
	};

	const toggleMicrophone = async () => {
		if (microphoneState === 'on') {
			await stopMicrophone();
			appendEntry({ role: 'status', text: 'マイクを停止しました。' });
			return;
		}

		if (!sessionRef.current) {
			await connect();
		}

		if (!sessionRef.current) {
			return;
		}

		await startMicrophone();
	};

	const refreshSnapshotEvent = useEffectEvent(() => {
		void refreshSnapshot().catch(() => undefined);
	});

	const disconnectEvent = useEffectEvent(() => {
		void disconnect();
	});

	useEffect(() => {
		const interval = window.setInterval(() => {
			if (connectionState === 'connected' || sessionIdRef.current) {
				refreshSnapshotEvent();
			}
		}, 15000);

		return () => {
			window.clearInterval(interval);
		};
	}, [connectionState]);

	useEffect(() => {
		return () => {
			disconnectEvent();
		};
	}, []);

	return {
		connect,
		connectionState,
		disconnect,
		latestError,
		microphoneState,
		refreshSnapshot,
		toggleMicrophone,
		transcriptEntries,
	};
};
