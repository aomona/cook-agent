import 'server-only';

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

type SafeUrlMessages = {
	blockedMessage?: string;
	invalidProtocolMessage?: string;
};

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
		invalidProtocolMessage = 'HTTP または HTTPS の URL のみ取得できます。',
	}: SafeUrlMessages = {},
): Promise<URL> => {
	const url = new URL(value);

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
