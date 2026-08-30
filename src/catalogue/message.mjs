import { parse as parseIcu } from '@messageformat/parser';

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

// The five functions above read `{{ param }}`, the Transloco-era syntax still on disk. Everything
// below reads ICU instead, ahead of the codemod that switches the catalogue over. Both surfaces
// stay until each caller migrates in its own phase (see ideas/i18n/ICU en el catálogo i18n.md).

const CATEGORY_ORDER = ['zero', 'one', 'two', 'few', 'many', 'other'];
const BRANCHING_TYPES = new Set(['plural', 'select', 'selectordinal']);
const POSITION_PATTERN = /at line (\d+) col (\d+):/;

export class IcuSyntaxError extends Error {
	constructor(message, { line, col } = {}) {
		super(message);
		this.name = 'IcuSyntaxError';
		this.line = line;
		this.col = col;
	}
}

export function parse(text) {
	try {
		return parseIcu(String(text ?? ''));
	} catch (error) {
		const found = POSITION_PATTERN.exec(error.message);

		throw new IcuSyntaxError(error.message, {
			line: found ? Number(found[1]) : undefined,
			col: found ? Number(found[2]) : undefined,
		});
	}
}

function tokensAreIcu(tokens) {
	return tokens.some(
		(token) =>
			'octothorpe' === token.type || 'function' === token.type || BRANCHING_TYPES.has(token.type),
	);
}

export const isIcu = (text) => tokensAreIcu(parse(text));

function mergeParam(params, name, type, cases) {
	const existing = params.get(name);

	if (!existing) {
		params.set(name, { type, cases: [...cases] });

		return;
	}

	for (const key of cases) {
		if (!existing.cases.includes(key)) {
			existing.cases.push(key);
		}
	}
}

function collectParams(tokens, params) {
	for (const token of tokens) {
		if ('argument' === token.type || 'function' === token.type) {
			mergeParam(params, token.arg, 'plain', []);
		} else if (BRANCHING_TYPES.has(token.type)) {
			mergeParam(
				params,
				token.arg,
				token.type,
				token.cases.map((kase) => kase.key),
			);

			for (const kase of token.cases) {
				collectParams(kase.tokens, params);
			}
		}
	}
}

export function paramsOf(text) {
	const params = new Map();

	collectParams(parse(text), params);

	return params;
}

function leavesOfTokens(tokens) {
	let combos = [{ path: [], text: '' }];

	for (const token of tokens) {
		if (BRANCHING_TYPES.has(token.type)) {
			const next = [];

			for (const combo of combos) {
				for (const kase of token.cases) {
					for (const branch of leavesOfTokens(kase.tokens)) {
						next.push({
							path: [...combo.path, `${token.type}:${kase.key}`, ...branch.path],
							text: combo.text + branch.text,
						});
					}
				}
			}

			combos = next;
		} else {
			const raw = token.ctx.text;

			combos = combos.map((combo) => ({ ...combo, text: combo.text + raw }));
		}
	}

	return combos;
}

export const leavesOf = (text) => leavesOfTokens(parse(text));

function compareCategories(a, b) {
	if (a === b) {
		return 0;
	}

	if ('other' === a) {
		return 1;
	}

	if ('other' === b) {
		return -1;
	}

	const ai = CATEGORY_ORDER.indexOf(a);
	const bi = CATEGORY_ORDER.indexOf(b);

	if (-1 !== ai && -1 !== bi) {
		return ai - bi;
	}

	if (-1 !== ai) {
		return -1;
	}

	if (-1 !== bi) {
		return 1;
	}

	return a < b ? -1 : 1;
}

function groupByLevel(leaves, level, prefix) {
	const groups = new Map();

	for (const leaf of leaves) {
		const segment = leaf.path[level];

		if (undefined === segment || !segment.startsWith(prefix)) {
			throw new Error(
				`buildFrom: leaf [${leaf.path.join(', ')}] has no "${prefix}…" segment at level ${level}`,
			);
		}

		const key = segment.slice(prefix.length);

		if (!groups.has(key)) {
			groups.set(key, []);
		}
		groups.get(key).push(leaf);
	}

	return groups;
}

function renderShape(leaves, shape, level) {
	if (level === shape.length) {
		if (1 !== leaves.length) {
			const paths = leaves.map((leaf) => `[${leaf.path.join(', ')}]`).join(' vs ');

			throw new Error(`buildFrom: expected exactly one leaf, got ${leaves.length} (${paths})`);
		}

		return leaves[0].text;
	}

	const { type, arg } = shape[level];
	const groups = groupByLevel(leaves, level, `${type}:`);

	if (!groups.has('other')) {
		throw new Error(`buildFrom: "${arg}" (${type}) is missing its "other" case`);
	}

	const branches = [...groups.keys()]
		.sort(compareCategories)
		.map((key) => `${key} {${renderShape(groups.get(key), shape, level + 1)}}`)
		.join(' ');

	return `{${arg}, ${type}, ${branches}}`;
}

export function buildFrom(leaves, shape) {
	if (!Array.isArray(leaves) || 0 === leaves.length) {
		throw new Error('buildFrom: needs at least one leaf');
	}

	const text = renderShape(leaves, shape, 0);

	parse(text);

	return text;
}
