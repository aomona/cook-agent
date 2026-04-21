import { cookies } from 'next/headers';
import { after } from 'next/server';
import { z } from 'zod';
import { createRecipeSourceForPlan, getRequestActor } from '@/lib/create-session';
import { getInvalidOriginResponse } from '@/lib/network/same-origin';
import { processRecipeSourceAndSyncPlans } from '@/lib/recipes/process-recipe-source';

const trimmedUrlSchema = z
	.string()
	.trim()
	.pipe(z.url({ error: '有効なURLを入力してください。' }));

const addRecipeSchema = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('url'),
		value: trimmedUrlSchema,
	}),
	z.object({
		type: z.literal('text'),
		value: z.string().trim().min(1),
	}),
]);

const getErrorResponse = (
	error: unknown,
): { message: string; shouldLog?: boolean; status: number } => {
	if (error instanceof z.ZodError) {
		return {
			message: error.issues[0]?.message ?? 'Invalid recipe input.',
			status: 400,
		};
	}

	if (error instanceof Error && error.message === 'Plan not found.') {
		return { message: error.message, status: 404 };
	}

	return {
		message: 'Failed to add recipe.',
		shouldLog: true,
		status: 500,
	};
};

const normalizeUrl = (value: string): string => {
	const url = new URL(value);
	return url.toString();
};

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ planId: string }> }) {
	const invalidOriginResponse = getInvalidOriginResponse(request);

	if (invalidOriginResponse) {
		return invalidOriginResponse;
	}

	const cookieStore = await cookies();
	const actor = await getRequestActor(cookieStore);

	if (!actor) {
		return Response.json({ message: 'Unauthorized.' }, { status: 401 });
	}

	try {
		const { planId } = await context.params;
		const body = addRecipeSchema.parse(await request.json());
		const value = body.type === 'url' ? normalizeUrl(body.value) : body.value;
		const recipe = await createRecipeSourceForPlan({
			planId,
			userId: actor.userId,
			type: body.type,
			value,
		});

		after(async () => {
			await processRecipeSourceAndSyncPlans(recipe.id, {
				sourceText: body.type === 'text' ? value : undefined,
			});
		});

		return Response.json({ recipe }, { status: 202 });
	} catch (error) {
		const { message, shouldLog, status } = getErrorResponse(error);

		if (shouldLog) {
			console.error(error);
		}

		return Response.json({ message }, { status });
	}
}
