import 'server-only';

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '@/db';
import * as schema from '@/db/schema';
import { getRequiredEnv } from '@/lib/env';

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: 'pg',
		schema,
	}),
	socialProviders: {
		github: {
			clientId: getRequiredEnv('GITHUB_CLIENT_ID'),
			clientSecret: getRequiredEnv('GITHUB_CLIENT_SECRET'),
		},
	},
});
