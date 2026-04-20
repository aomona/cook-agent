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
import { decodePcm16Base64ToFloat32, downsampleToPcm16Base64 } from './live-audio';

export type RuntimeTranscriptEntry = {
	id: string;
	role: 'assistant' | 'status' | 'tool' | 'user';
	text: string;
	createdAt: number;
};

type ConnectionState = 'connected' | 'connecting' | 'disconnected' | 'error' | 'idle';
type MicrophoneState = 'off' | 'on' | 'requesting';

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
	const [microphoneState, setMicrophoneState] = useState<MicrophoneState>('off');
	const [latestError, setLatestError] = useState<string | null>(null);
	const [transcriptEntries, setTranscriptEntries] = useState<RuntimeTranscriptEntry[]>([]);
	const sessionRef = useRef<Session | null>(null);
	const sessionIdRef = useRef<string | null>(null);
	const disconnectRequestedRef = useRef(false);
	const resumptionHandleRef = useRef<string | null>(null);
	const microphoneContextRef = useRef<AudioContext | null>(null);
	const microphoneSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
	const microphoneProcessorRef = useRef<ScriptProcessorNode | null>(null);
	const microphoneStreamRef = useRef<MediaStream | null>(null);
	const microphoneEnabledRef = useRef(false);
	const playbackContextRef = useRef<AudioContext | null>(null);
	const playbackSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
	const nextPlaybackTimeRef = useRef(0);

	const appendEntry = (entry: Omit<RuntimeTranscriptEntry, 'createdAt' | 'id'>) => {
		setTranscriptEntries((currentEntries) => appendTranscriptEntry(currentEntries, entry));
	};

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

	const clearPlaybackQueue = () => {
		for (const source of playbackSourcesRef.current) {
			source.stop();
		}

		playbackSourcesRef.current.clear();
		nextPlaybackTimeRef.current = playbackContextRef.current?.currentTime ?? 0;
	};

	const queuePlayback = (base64Pcm: string) => {
		const playbackContext = playbackContextRef.current;

		if (!playbackContext) {
			return;
		}

		const samples = decodePcm16Base64ToFloat32(base64Pcm);
		const audioBuffer = playbackContext.createBuffer(1, samples.length, 24000);
		audioBuffer.copyToChannel(new Float32Array(samples), 0);

		const source = playbackContext.createBufferSource();
		source.buffer = audioBuffer;
		source.connect(playbackContext.destination);
		const startAt = Math.max(nextPlaybackTimeRef.current, playbackContext.currentTime);
		source.start(startAt);
		nextPlaybackTimeRef.current = startAt + audioBuffer.duration;
		playbackSourcesRef.current.add(source);
		source.onended = () => {
			playbackSourcesRef.current.delete(source);
		};
	};

	const stopMicrophone = () => {
		microphoneEnabledRef.current = false;
		sessionRef.current?.sendRealtimeInput({ audioStreamEnd: true });
		microphoneProcessorRef.current?.disconnect();
		microphoneSourceRef.current?.disconnect();
		microphoneStreamRef.current?.getTracks().forEach((track) => {
			track.stop();
		});
		void microphoneContextRef.current?.close();
		microphoneProcessorRef.current = null;
		microphoneSourceRef.current = null;
		microphoneStreamRef.current = null;
		microphoneContextRef.current = null;
		setMicrophoneState('off');
	};

	const disconnect = async () => {
		disconnectRequestedRef.current = true;
		stopMicrophone();
		clearPlaybackQueue();
		sessionRef.current?.close();
		sessionRef.current = null;
		void playbackContextRef.current?.close();
		playbackContextRef.current = null;
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
			response: { result: unknown };
		}[] = [];

		for (const functionCall of functionCalls) {
			if (!functionCall.name || !functionCall.id) {
				continue;
			}

			appendEntry({ role: 'tool', text: `補助ツール実行: ${functionCall.name}` });
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
				throw new Error(payload.message ?? `Tool failed: ${functionCall.name}`);
			}

			functionResponses.push({
				id: functionCall.id,
				name: functionCall.name,
				response: {
					result: payload.result ?? null,
				},
			});
		}

		session.sendToolResponse({ functionResponses });
		await refreshSnapshot();
	};

	const handleMessage = (message: LiveServerMessage) => {
		if (message.sessionResumptionUpdate?.resumable && message.sessionResumptionUpdate.newHandle) {
			resumptionHandleRef.current = message.sessionResumptionUpdate.newHandle;
		}

		if (message.toolCall?.functionCalls?.length) {
			void handleToolCalls(message.toolCall.functionCalls);
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

			const playbackContext = new AudioContext();
			await playbackContext.resume();
			playbackContextRef.current = playbackContext;
			nextPlaybackTimeRef.current = playbackContext.currentTime;

			const ai = new GoogleGenAI({
				apiKey: payload.token,
				apiVersion: 'v1alpha',
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
						stopMicrophone();
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

	const startMicrophone = async () => {
		if (microphoneState === 'requesting' || microphoneState === 'on') {
			return;
		}

		if (!sessionRef.current) {
			await connect();
		}

		if (!sessionRef.current) {
			return;
		}

		setMicrophoneState('requesting');

		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: {
					autoGainControl: true,
					echoCancellation: true,
					noiseSuppression: true,
				},
			});
			const audioContext = new AudioContext();
			await audioContext.resume();
			const source = audioContext.createMediaStreamSource(stream);
			const processor = audioContext.createScriptProcessor(4096, 1, 1);

			microphoneEnabledRef.current = true;
			processor.onaudioprocess = (event) => {
				const activeSession = sessionRef.current;

				if (!activeSession || !microphoneEnabledRef.current) {
					return;
				}

				const input = event.inputBuffer.getChannelData(0);
				const pcmData = downsampleToPcm16Base64({
					input,
					inputSampleRate: audioContext.sampleRate,
				});

				if (!pcmData) {
					return;
				}

				activeSession.sendRealtimeInput({
					audio: {
						data: pcmData,
						mimeType: 'audio/pcm;rate=16000',
					},
				});
			};

			source.connect(processor);
			processor.connect(audioContext.destination);
			microphoneContextRef.current = audioContext;
			microphoneSourceRef.current = source;
			microphoneProcessorRef.current = processor;
			microphoneStreamRef.current = stream;
			setMicrophoneState('on');
			appendEntry({ role: 'status', text: 'マイクを有効にしました。話しかけてください。' });
		} catch (error) {
			setMicrophoneState('off');
			setLatestError(error instanceof Error ? error.message : 'マイクを開始できませんでした。');
			appendEntry({ role: 'status', text: 'マイクを開始できませんでした。' });
		}
	};

	const toggleMicrophone = async () => {
		if (microphoneState === 'on') {
			stopMicrophone();
			appendEntry({ role: 'status', text: 'マイクを停止しました。' });
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
