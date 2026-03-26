import { ElementType, parseDocument } from 'htmlparser2';

const ignoredTagNames = new Set(['script', 'style', 'noscript', 'svg', 'iframe']);
const lineBreakTagNames = new Set([
	'article',
	'aside',
	'br',
	'div',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'header',
	'li',
	'main',
	'p',
	'section',
	'tr',
]);
const spacedTagNames = new Set(['td', 'th']);
const whitespacePattern = /[ \t\f\v\u00a0]+/g;
const newlinePattern = /\n{3,}/g;

type ParsedNode = ReturnType<typeof parseDocument>['children'][number];

const appendToken = (tokens: string[], token: string): void => {
	if (!token) {
		return;
	}

	const lastToken = tokens.at(-1);

	if (token === '\n') {
		if (lastToken !== '\n') {
			tokens.push(token);
		}

		return;
	}

	if (token === ' ') {
		if (!lastToken || lastToken === ' ' || lastToken === '\n') {
			return;
		}

		tokens.push(token);
		return;
	}

	if (lastToken === ' ') {
		tokens[tokens.length - 1] = `${lastToken}${token}`;
		return;
	}

	tokens.push(token);
};

const visitNode = (node: ParsedNode, tokens: string[]): void => {
	if (node.type === ElementType.Text) {
		appendToken(tokens, node.data);
		return;
	}

	if (!('name' in node) || !('children' in node)) {
		return;
	}

	const tagName = node.name.toLowerCase();

	if (ignoredTagNames.has(tagName)) {
		return;
	}

	if (lineBreakTagNames.has(tagName)) {
		appendToken(tokens, '\n');
	}

	if (spacedTagNames.has(tagName)) {
		appendToken(tokens, ' ');
	}

	for (const child of node.children) {
		visitNode(child, tokens);
	}

	if (spacedTagNames.has(tagName)) {
		appendToken(tokens, ' ');
	}

	if (lineBreakTagNames.has(tagName) && tagName !== 'br') {
		appendToken(tokens, '\n');
	}
};

export const extractHtmlText = (html: string): string => {
	const document = parseDocument(html, {
		decodeEntities: true,
		lowerCaseAttributeNames: true,
		lowerCaseTags: true,
	});
	const tokens: string[] = [];

	for (const child of document.children) {
		visitNode(child, tokens);
	}

	return tokens
		.join('')
		.replace(/\r/g, '\n')
		.replace(whitespacePattern, ' ')
		.replace(/ *\n */g, '\n')
		.replace(newlinePattern, '\n\n')
		.trim();
};
