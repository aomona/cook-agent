import 'server-only';

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

type SafeUrlMessages = {
	blockedMessage?: string;
	invalidProtocolMessage?: string;
};

const isPrivateIpv4 = (address: string): boolean => {
	const octets = address.split('.').map((segment) => Number.parseInt(segment, 10));

	if (octets.length !== 4 || octets.some((octet) => Number.isNaN(octet))) {
		return true;
	}

	if (octets[0] === 10 || octets[0] === 127) {
		return true;
	}

	if (octets[0] === 169 && octets[1] === 254) {
		return true;
	}

	if (octets[0] === 192 && octets[1] === 168) {
		return true;
	}

	return octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31;
};

const isPrivateIpv6 = (address: string): boolean => {
	const normalizedAddress = address.toLowerCase();

	if (normalizedAddress === '::1') {
		return true;
	}

	if (normalizedAddress.startsWith('::ffff:')) {
		return isPrivateIpAddress(normalizedAddress.slice(7));
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

const isPrivateIpAddress = (address: string): boolean => {
	const ipVersion = isIP(address);

	if (ipVersion === 4) {
		return isPrivateIpv4(address);
	}

	if (ipVersion === 6) {
		return isPrivateIpv6(address);
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
		if (isPrivateIpAddress(hostname)) {
			throw new Error(blockedMessage);
		}

		return url;
	}

	const addresses = await lookup(hostname, { all: true, verbatim: true });

	if (addresses.some(({ address }) => isPrivateIpAddress(address))) {
		throw new Error(blockedMessage);
	}

	return url;
};
