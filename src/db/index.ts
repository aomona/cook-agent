import { drizzle } from 'drizzle-orm/neon-http';

export * from './auth-schema';

export const db = drizzle(process.env.DATABASE_URL as string);
