import { createAuthClient } from 'better-auth/react';

const authClient = createAuthClient();

export const signIn = async () => {
	const data = await authClient.signIn.social({
		provider: 'github',
	});
	return data;
};

export const signOut = async () => {
	await authClient.signOut();
};

export const { useSession } = authClient;
