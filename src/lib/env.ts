export const getRequiredEnv = (name: 'OPENAI_API_KEY' | 'TAVILY_API_KEY'): string => {
	const value = process.env[name];

	if (!value) {
		throw new Error(`${name} is required.`);
	}

	return value;
};
