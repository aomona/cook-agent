'use client';

import { useRef } from 'react';
import { decodePcm16Base64ToFloat32 } from './live-audio';

export const useAudioPlaybackQueue = () => {
	const playbackContextRef = useRef<AudioContext | null>(null);
	const playbackSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
	const nextPlaybackTimeRef = useRef(0);

	const initializePlayback = async () => {
		const existingContext = playbackContextRef.current;

		if (existingContext) {
			await existingContext.resume();
			nextPlaybackTimeRef.current = existingContext.currentTime;
			return existingContext;
		}

		const playbackContext = new AudioContext();
		await playbackContext.resume();
		playbackContextRef.current = playbackContext;
		nextPlaybackTimeRef.current = playbackContext.currentTime;

		return playbackContext;
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

	const disposePlayback = async () => {
		clearPlaybackQueue();
		const playbackContext = playbackContextRef.current;
		playbackContextRef.current = null;

		if (playbackContext) {
			await playbackContext.close();
		}
	};

	return {
		clearPlaybackQueue,
		disposePlayback,
		initializePlayback,
		queuePlayback,
	};
};
