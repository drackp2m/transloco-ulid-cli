const PARAM_PATTERN = /\{\{\s*([\w.]+)\s*\}\}/g;

export const paramTag = (name) => `{{ ${name} }}`;

export function paramsIn(text) {
	return [...String(text ?? '').matchAll(PARAM_PATTERN)].map((match) => ({
		name: match[1],
		text: match[0],
		index: match.index,
		length: match[0].length,
	}));
}

export const paramNamesOf = (text) => [...new Set(paramsIn(text).map(({ name }) => name))];

export function paramDiff(base, value) {
	const expected = paramNamesOf(base);
	const actual = paramNamesOf(value);

	return {
		dropped: expected.filter((name) => !actual.includes(name)),
		added: actual.filter((name) => !expected.includes(name)),
	};
}

export function sameParams(base, value) {
	const { dropped, added } = paramDiff(base, value);

	return 0 === dropped.length && 0 === added.length;
}
