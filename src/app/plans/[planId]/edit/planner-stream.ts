export type PlannerStreamMessage =
	| { type: 'status'; message: string }
	| { type: 'reasoning'; delta: string }
	| { type: 'tool'; message: string };

export const readEventStream = async ({
	onError,
	onMessage,
	response,
}: {
	response: Response;
	onMessage: (event: string, payload: unknown) => void;
	onError: (message: string) => void;
}): Promise<void> => {
	if (!response.body) {
		throw new Error('ストリームを開始できませんでした。');
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	const flushBlock = (block: string): void => {
		const lines = block
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean);

		if (lines.length === 0) {
			return;
		}

		const eventLine = lines.find((line) => line.startsWith('event:'));
		const dataLines = lines.filter((line) => line.startsWith('data:'));
		const event = eventLine?.slice('event:'.length).trim() ?? 'message';
		const data = dataLines.map((line) => line.slice('data:'.length).trim()).join('\n');
		let payload: unknown;

		try {
			payload = JSON.parse(data);
		} catch {
			onError('ストリームの解析に失敗しました。');
			return;
		}

		onMessage(event, payload);
	};

	while (true) {
		const { done, value } = await reader.read();

		if (done) {
			break;
		}

		buffer += decoder.decode(value, { stream: true });

		const blocks = buffer.split('\n\n');
		buffer = blocks.pop() ?? '';

		for (const block of blocks) {
			flushBlock(block);
		}
	}

	buffer += decoder.decode();

	if (buffer.trim()) {
		flushBlock(buffer);
	}
};
