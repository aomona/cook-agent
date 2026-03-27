import { cookies } from 'next/headers';
import { after } from 'next/server';
import { z } from 'zod';
import { createRecipeSourceForPlan, getRequestActor } from '@/lib/create-session';
import { processRecipeSource } from '@/lib/recipes/process-recipe-source';

const addRecipeSchema = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('url'),
		value: z.string().trim().url('有効なURLを入力してください。'),
	}),
	z.object({
		type: z.literal('text'),
		value: z.string().trim().min(1),
	}),
]);

const getErrorMessage = (error: unknown): string => {
	if (error instanceof Error && error.message) {
		return error.message;
	}

	return 'Failed to add recipe.';
};

const normalizeUrl = (value: string): string => {
	const url = new URL(value);
	return url.toString();
};

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ planId: string }> }) {
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
			await processRecipeSource(recipe.id, {
				sourceText: body.type === 'text' ? value : undefined,
			});
		});

		return Response.json({ recipe }, { status: 202 });
	} catch (error) {
		if (error instanceof z.ZodError) {
			return Response.json(
				{ message: error.issues[0]?.message ?? 'Invalid recipe input.' },
				{ status: 400 },
			);
		}

		const message = getErrorMessage(error);
		const status = message === 'Plan not found.' ? 404 : 400;

		return Response.json({ message }, { status });
	}
}
