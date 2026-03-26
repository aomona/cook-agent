'use client';

import { Button } from '@workspaces/ui';
import { useState } from 'react';
import { signIn } from '@/lib/auth-client';

export const SignInButton = () => {
	const [isLoading, setIsLoading] = useState(false);

	const handleSignIn = async (): Promise<void> => {
		setIsLoading(true);

		try {
			await signIn();
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<Button loading={isLoading} onClick={() => void handleSignIn()} variant="solid">
			GitHub でログイン
		</Button>
	);
};
