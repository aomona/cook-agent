import 'server-only';

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

type SafeUrlMessages = {
	blockedMessage?: string;
	invalidRedirectMessage?: string;
	invalidProtocolMessage?: string;
};

type SafePublicFetchOptions = SafeUrlMessages & {
	headers?: HeadersInit;
	maxRedirects?: number;
	maxResponseBytes?: number;
	timeoutMessage?: string;
	timeoutMs?: number;
	tooLargeMessage?: string;
};

const defaultFetchTimeoutMs = 10_000;
const defaultMaxRedirects = 3;
const defaultMaxResponseBytes = 1_000_000;

const isBlockedIpv4 = (address: string): boolean => {
	const octets = address.split('.').map((segment) => Number.parseInt(segment, 10));

	if (
		octets.length !== 4 ||
		octets.some((octet) => Number.isNaN(octet) || octet < 0 || octet > 255)
	) {
		return true;
	}

	const [first, second, third] = octets;

	if (first === 0 || first === 10 || first === 127) {
		return true;
	}

	if (first === 100 && second >= 64 && second <= 127) {
		return true;
	}

	if (first === 169 && second === 254) {
		return true;
	}

	if (first === 172 && second >= 16 && second <= 31) {
		return true;
	}

	if (first === 192 && second === 168) {
		return true;
	}

	if (first === 192 && second === 0 && (third === 0 || third === 2)) {
		return true;
	}

	if (first === 198 && (second === 18 || second === 19)) {
		return true;
	}

	if (first === 198 && second === 51 && third === 100) {
		return true;
	}

	if (first === 203 && second === 0 && third === 113) {
		return true;
	}

	return first >= 224;
};

const isBlockedIpv6 = (address: string): boolean => {
	const normalizedAddress = address.toLowerCase();

	if (normalizedAddress === '::1') {
		return true;
	}

	if (normalizedAddress.startsWith('::ffff:')) {
		return isBlockedIpAddress(normalizedAddress.slice(7));
	}

	if (normalizedAddress.startsWith('fc') || normalizedAddress.startsWith('fd')) {
		return true;
	}

	return (
		normalizedAddress.startsWith('fe8') ||
		normalizedAddress.startsWith('fe9') ||
		normalizedAddress.startsWith('fea') ||
		normalizedAddress.startsWith('feb')
	);
};

const isBlockedIpAddress = (address: string): boolean => {
	const ipVersion = isIP(address);

	if (ipVersion === 4) {
		return isBlockedIpv4(address);
	}

	if (ipVersion === 6) {
		return isBlockedIpv6(address);
	}

	return true;
};

export const assertSafePublicHttpUrl = async (
	value: string,
	{
		blockedMessage = 'この URL は取得できません。',
		invalidRedirectMessage = 'この URL には無効なリダイレクトが含まれています。',
		invalidProtocolMessage = 'HTTP または HTTPS の URL のみ取得できます。',
	}: SafeUrlMessages = {},
): Promise<URL> => {
	let url: URL;

	try {
		url = new URL(value);
	} catch {
		throw new Error(invalidRedirectMessage);
	}

	if (!['http:', 'https:'].includes(url.protocol)) {
		throw new Error(invalidProtocolMessage);
	}

	const hostname = url.hostname.toLowerCase();

	if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
		throw new Error(blockedMessage);
	}

	if (isIP(hostname) !== 0) {
		if (isBlockedIpAddress(hostname)) {
			throw new Error(blockedMessage);
		}

		return url;
	}

	const addresses = await lookup(hostname, { all: true, verbatim: true });

	if (addresses.some(({ address }) => isBlockedIpAddress(address))) {
		throw new Error(blockedMessage);
	}

	return url;
};

const readResponseTextWithinLimit = async (
	response: Response,
	maxResponseBytes: number,
	tooLargeMessage: string,
): Promise<string> => {
	if (!response.body) {
		return '';
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let totalBytes = 0;
	let text = '';

	try {
		while (true) {
			const { done, value } = await reader.read();

			if (done) {
				break;
			}

			totalBytes += value.byteLength;

			if (totalBytes > maxResponseBytes) {
				await reader.cancel();
				throw new Error(tooLargeMessage);
			}

			text += decoder.decode(value, { stream: true });
		}
	} finally {
		reader.releaseLock();
	}

	return `${text}${decoder.decode()}`;
};

export const fetchSafePublicText = async (
	value: string,
	{
		blockedMessage = 'この URL は取得できません。',
		headers,
		invalidProtocolMessage = 'HTTP または HTTPS の URL のみ取得できます。',
		invalidRedirectMessage = 'この URL には無効なリダイレクトが含まれています。',
		maxRedirects = defaultMaxRedirects,
		maxResponseBytes = defaultMaxResponseBytes,
		timeoutMessage = 'URL の取得がタイムアウトしました。',
		timeoutMs = defaultFetchTimeoutMs,
		tooLargeMessage = '取得したページが大きすぎます。別の URL を試してください。',
	}: SafePublicFetchOptions = {},
): Promise<{ response: Response; text: string; url: URL }> => {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
	let currentUrl = await assertSafePublicHttpUrl(value, {
		blockedMessage,
		invalidProtocolMessage,
		invalidRedirectMessage,
	});

	try {
		for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
			const response = await fetch(currentUrl, {
				cache: 'no-store',
				headers,
				redirect: 'manual',
				signal: controller.signal,
			});

			if (response.status >= 300 && response.status < 400) {
				if (redirectCount === maxRedirects) {
					throw new Error(invalidRedirectMessage);
				}

				const location = response.headers.get('location');

				if (!location) {
					throw new Error(invalidRedirectMessage);
				}

				currentUrl = await assertSafePublicHttpUrl(new URL(location, currentUrl).toString(), {
					blockedMessage,
					invalidProtocolMessage,
					invalidRedirectMessage,
				});
				continue;
			}

			const text = await readResponseTextWithinLimit(response, maxResponseBytes, tooLargeMessage);

			return {
				response,
				text,
				url: currentUrl,
			};
		}

		throw new Error(invalidRedirectMessage);
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') {
			throw new Error(timeoutMessage);
		}

		throw error;
	} finally {
		clearTimeout(timeoutId);
	}
};
