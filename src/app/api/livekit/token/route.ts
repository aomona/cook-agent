export const runtime = 'nodejs';

export async function GET() {
	return Response.json(
		{ message: 'Deprecated route. Gemini Live token endpoint will replace this path.' },
		{ status: 410 },
	);
}
