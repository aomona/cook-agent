import 'server-only';

import { drizzle } from 'drizzle-orm/neon-http';
import { getRequiredEnv } from '@/lib/env';

export const db = drizzle(getRequiredEnv('DATABASE_URL'));
