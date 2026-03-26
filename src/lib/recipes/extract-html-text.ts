const commentPattern = /<!--[\s\S]*?-->/g;
const ignoredElementPattern = /<(script|style|noscript|svg|iframe)[^>]*>[\s\S]*?<\/\1>/gi;
const lineBreakTagPattern =
	/<(\/)?(article|aside|br|div|h[1-6]|header|li|main|p|section|tr)[^>]*>/gi;
const tableCellPattern = /<(\/)?(td|th)[^>]*>/gi;
const tagPattern = /<[^>]+>/g;
const whitespacePattern = /[ \t\f\v\u00a0]+/g;
const newlinePattern = /\n{3,}/g;

const decodeHtmlEntities = (value: string): string =>
	value
		.replaceAll('&nbsp;', ' ')
		.replaceAll('&amp;', '&')
		.replaceAll('&lt;', '<')
		.replaceAll('&gt;', '>')
		.replaceAll('&quot;', '"')
		.replaceAll('&#39;', "'");

export const extractHtmlText = (html: string): string => {
	return decodeHtmlEntities(
		html
			.replace(commentPattern, ' ')
			.replace(ignoredElementPattern, ' ')
			.replace(lineBreakTagPattern, '\n')
			.replace(tableCellPattern, ' ')
			.replace(tagPattern, ' ')
			.replace(/\r/g, '\n')
			.replace(whitespacePattern, ' ')
			.replace(/ *\n */g, '\n')
			.replace(newlinePattern, '\n\n'),
	).trim();
};
