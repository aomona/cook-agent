const int16ToBase64 = (samples: Int16Array): string => {
	const bytes = new Uint8Array(samples.buffer);
	let binary = '';

	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}

	return btoa(binary);
};

export const downsampleToPcm16Base64 = ({
	input,
	inputSampleRate,
	outputSampleRate = 16000,
}: {
	input: Float32Array;
	inputSampleRate: number;
	outputSampleRate?: number;
}): string | null => {
	if (input.length === 0) {
		return null;
	}

	if (inputSampleRate === outputSampleRate) {
		const pcm = new Int16Array(input.length);

		for (let index = 0; index < input.length; index += 1) {
			const clamped = Math.max(-1, Math.min(1, input[index] ?? 0));
			pcm[index] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
		}

		return int16ToBase64(pcm);
	}

	const ratio = inputSampleRate / outputSampleRate;
	const nextLength = Math.max(1, Math.round(input.length / ratio));
	const pcm = new Int16Array(nextLength);
	let sourceIndex = 0;

	for (let targetIndex = 0; targetIndex < nextLength; targetIndex += 1) {
		const nextSourceIndex = Math.min(input.length, Math.round((targetIndex + 1) * ratio));
		let sum = 0;
		let count = 0;

		for (let index = sourceIndex; index < nextSourceIndex; index += 1) {
			sum += input[index] ?? 0;
			count += 1;
		}

		const averaged = count > 0 ? sum / count : (input[sourceIndex] ?? 0);
		const clamped = Math.max(-1, Math.min(1, averaged));
		pcm[targetIndex] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
		sourceIndex = nextSourceIndex;
	}

	return int16ToBase64(pcm);
};

export const decodePcm16Base64ToFloat32 = (base64Data: string): Float32Array => {
	const binary = atob(base64Data);
	const bytes = new Uint8Array(binary.length);

	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}

	const view = new DataView(bytes.buffer);
	const float32 = new Float32Array(bytes.byteLength / 2);

	for (let index = 0; index < float32.length; index += 1) {
		float32[index] = view.getInt16(index * 2, true) / 0x8000;
	}

	return float32;
};
