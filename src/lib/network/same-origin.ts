const forbiddenOriginMessage = 'Forbidden.';

const normalizeOrigin = (value: string): string | null => {
	try {
		return new URL(value).origin;
	} catch {
		return null;
	}
};

export const getInvalidOriginResponse = (request: Request): Response | null => {
	const requestOrigin = normalizeOrigin(request.url);
	const headerOrigin = request.headers.get('origin');
	const normalizedHeaderOrigin = headerOrigin ? normalizeOrigin(headerOrigin) : null;

	if (!requestOrigin || !normalizedHeaderOrigin || normalizedHeaderOrigin !== requestOrigin) {
		return Response.json({ message: forbiddenOriginMessage }, { status: 403 });
	}

	return null;
};
