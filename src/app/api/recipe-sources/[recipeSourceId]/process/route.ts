import { and, eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { after } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { recipeSources } from '@/db/schema';
import { getRequestActor } from '@/lib/create-session';
import { processRecipeSource } from '@/lib/recipes/process-recipe-source';

const recipeSourceIdSchema = z.string().uuid();

export async function POST(
	_request: Request,
	context: { params: Promise<{ recipeSourceId: string }> },
) {
	const cookieStore = await cookies();
	const actor = await getRequestActor(cookieStore);

	if (!actor) {
		return Response.json({ message: 'Unauthorized.' }, { status: 401 });
	}

	const { recipeSourceId: rawRecipeSourceId } = await context.params;
	const parsedRecipeSourceId = recipeSourceIdSchema.safeParse(rawRecipeSourceId);

	if (!parsedRecipeSourceId.success) {
		return Response.json({ message: 'Recipe source not found.' }, { status: 404 });
	}

	const recipeSourceId = parsedRecipeSourceId.data;
	const [recipeSource] = await db
		.select({
			id: recipeSources.id,
		})
		.from(recipeSources)
		.where(and(eq(recipeSources.id, recipeSourceId), eq(recipeSources.userId, actor.userId)));

	if (!recipeSource) {
		return Response.json({ message: 'Recipe source not found.' }, { status: 404 });
	}

	after(async () => {
		await processRecipeSource(recipeSource.id);
	});

	return Response.json({ status: 'queued' }, { status: 202 });
}
