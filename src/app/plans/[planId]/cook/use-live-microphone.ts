'use client';

import type { Session } from '@google/genai';
import { useRef, useState } from 'react';
import { downsampleToPcm16Base64 } from './live-audio';

export type MicrophoneState = 'off' | 'on' | 'requesting';

export const useLiveMicrophone = ({
	getSession,
	onError,
	onStarted,
	onStopped,
}: {
	getSession: () => Session | null;
	onError: (message: string) => void;
	onStarted: () => void;
	onStopped: () => void;
}) => {
	const [microphoneState, setMicrophoneState] = useState<MicrophoneState>('off');
	const microphoneContextRef = useRef<AudioContext | null>(null);
	const microphoneSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
	const microphoneProcessorRef = useRef<ScriptProcessorNode | null>(null);
	const microphoneStreamRef = useRef<MediaStream | null>(null);
	const microphoneEnabledRef = useRef(false);

	const stopMicrophone = async () => {
		microphoneEnabledRef.current = false;
		getSession()?.sendRealtimeInput({ audioStreamEnd: true });
		microphoneProcessorRef.current?.disconnect();
		microphoneSourceRef.current?.disconnect();
		microphoneStreamRef.current?.getTracks().forEach((track) => {
			track.stop();
		});

		const audioContext = microphoneContextRef.current;
		microphoneProcessorRef.current = null;
		microphoneSourceRef.current = null;
		microphoneStreamRef.current = null;
		microphoneContextRef.current = null;
		setMicrophoneState('off');
		onStopped();

		if (audioContext) {
			await audioContext.close();
		}
	};

	const startMicrophone = async () => {
		if (microphoneState === 'requesting' || microphoneState === 'on') {
			return false;
		}

		if (!getSession()) {
			return false;
		}

		setMicrophoneState('requesting');
		let stream: MediaStream | null = null;
		let audioContext: AudioContext | null = null;
		let source: MediaStreamAudioSourceNode | null = null;
		let processor: ScriptProcessorNode | null = null;

		try {
			stream = await navigator.mediaDevices.getUserMedia({
				audio: {
					autoGainControl: true,
					echoCancellation: true,
					noiseSuppression: true,
				},
			});
			audioContext = new AudioContext();
			await audioContext.resume();
			source = audioContext.createMediaStreamSource(stream);
			processor = audioContext.createScriptProcessor(4096, 1, 1);

			microphoneEnabledRef.current = true;
			processor.onaudioprocess = (event) => {
				const activeSession = getSession();

				if (!activeSession || !microphoneEnabledRef.current || !audioContext) {
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
			onStarted();

			return true;
		} catch (error) {
			if (stream) {
				stream.getTracks().forEach((track) => {
					track.stop();
				});
			}
			if (source) {
				source.disconnect();
			}
			if (processor) {
				processor.disconnect();
			}
			if (audioContext) {
				await audioContext.close();
			}

			setMicrophoneState('off');
			onError(error instanceof Error ? error.message : 'マイクを開始できませんでした。');
			return false;
		}
	};

	return {
		microphoneState,
		startMicrophone,
		stopMicrophone,
	};
};
