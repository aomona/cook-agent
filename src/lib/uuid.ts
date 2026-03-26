import { z } from 'zod';

const uuidSchema = z.string().uuid();

export const parseUuid = (value: string): string | null => {
	const parsed = uuidSchema.safeParse(value);

	return parsed.success ? parsed.data : null;
};

export const isUuid = (value: string): boolean => parseUuid(value) !== null;
