import 'server-only';

const requiredEnvNames = [
	'DATABASE_URL',
	'GITHUB_CLIENT_ID',
	'GITHUB_CLIENT_SECRET',
	'OPENAI_API_KEY',
	'TAVILY_API_KEY',
] as const;

type RequiredEnvName = (typeof requiredEnvNames)[number];

export const isProduction = process.env.NODE_ENV === 'production';

export const getRequiredEnv = (name: RequiredEnvName): string => {
	const value = process.env[name];

	if (!value) {
		throw new Error(`${name} is required.`);
	}

	return value;
};
