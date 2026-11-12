import { AMBIENT_PARAMS } from '../catalogue/config.mjs';
import { formCountOf, isExactCase } from '../catalogue/forms.mjs';
import { GENDER_ARG, GENDER_VALUES } from '../catalogue/genders.mjs';
import { IcuSyntaxError, paramTag, paramsOf, parse } from '../catalogue/message.mjs';
import { cardinalCategoriesOf, requiredCategoriesOf } from '../catalogue/plurals.mjs';

const OTHER = 'other';

// Two plurals crossed are 16 forms in Russian, Polish or Ukrainian, and gender over a plural
// is 12 there: a sentence that counts two things fits, and that is already a lot to hand a
// translator for one sentence. Past that the string is asking to be split in two, not
// fanned out wider.
const MAX_FORMS = 16;

const listOf = (items, word) =>
	1 === items.length ? items[0] : `${items.slice(0, -1).join(', ')} ${word} ${items.at(-1)}`;

const problem = (type, message, where = {}) => ({
	type,
	message,
	name: where.name ?? null,
	key: where.key ?? null,
	at: where.at ?? null,
});

// An exact match (`=0`) answers for one number and no category, so no language declares
// it and none of the category rules have anything to say about it.
function surplusCategories(name, cases, declared, lang) {
	return cases
		.filter((key) => !isExactCase(key) && !declared.includes(key))
		.map((key) => {
			const message = `${paramTag(name)} branches on "${key}", which "${lang}" never selects`;

			return problem('unknown-plural-category', message, { name, key });
		});
}

// `other` is every branching argument's own rule, so the categories skip it and a plural
// with nothing but `one` is one problem and not two.
function missingCategories(name, cases, lang) {
	return requiredCategoriesOf(lang)
		.filter((key) => OTHER !== key && !cases.includes(key))
		.map((key) => {
			const message = `${paramTag(name)} has no "${key}" branch, which "${lang}" needs`;

			return problem('missing-plural-category', message, { name, key });
		});
}

// Nothing else can catch a mistyped branch here: `gender` is ambient, so it is left out of
// `params.ts` and TypeScript never sees it. The application would fall through to `other`
// without a word, and the export would ship a form nobody can ever read.
function genderValueProblems(name, cases) {
	if (GENDER_ARG !== name) {
		return [];
	}

	return cases
		.filter((key) => !GENDER_VALUES.includes(key))
		.map((key) => {
			const message = `${paramTag(name)} branches on "${key}", which the gender setting never has`;

			return problem('unknown-gender-value', message, { name, key });
		});
}

function categoryProblems(name, cases, lang) {
	const declared = cardinalCategoriesOf(lang);

	if (null === declared) {
		return [];
	}

	return [
		...surplusCategories(name, cases, declared, lang),
		...missingCategories(name, cases, lang),
	];
}

// Ordinals have their own category table per language, a second whitelist nothing in the
// catalogue asks for yet: rejecting them outright beats validating them by halves.
function argumentProblems(name, { type, cases }, lang) {
	if ('plain' === type) {
		return [];
	}

	if ('selectordinal' === type) {
		const message = `${paramTag(name)} is a selectordinal, which the catalogue does not support`;

		return [problem('unsupported-argument', message, { name })];
	}

	const missingOther = cases.includes(OTHER)
		? []
		: [problem('missing-other', `${paramTag(name)} (${type}) has no "${OTHER}" branch`, { name })];

	return 'plural' === type
		? [...missingOther, ...categoryProblems(name, cases, lang)]
		: [...missingOther, ...genderValueProblems(name, cases)];
}

// The one rule about the string as a whole rather than about an argument, so it carries no
// name and lands on the key's own heading.
function widthProblems(text, langs) {
	const over = langs
		.map((lang) => ({ lang, count: formCountOf(text, lang) }))
		.filter(({ count }) => MAX_FORMS < count);

	if (0 === over.length) {
		return [];
	}

	const widths = listOf(over.map(({ lang, count }) => `${count} forms in "${lang}"`), 'and');
	const message =
		`opens into ${widths}, over the ${MAX_FORMS} allowed — ` +
		'split the sentence instead of branching it further';

	return [problem('too-many-forms', message)];
}

function hasHash(tokens) {
	return tokens.some(
		(token) =>
			'octothorpe' === token.type || (token.cases ?? []).some((kase) => hasHash(kase.tokens)),
	);
}

function hashProblems(tokens, params) {
	const plurals = [...params].filter(([, { type }]) => 'plural' === type).map(([name]) => name);

	if (2 > plurals.length || !hasHash(tokens)) {
		return [];
	}

	const message =
		`writes # under ${listOf(plurals.map(paramTag), 'and')}, and once its forms are split ` +
		'nothing says which number each # is — write ' +
		`${listOf(plurals.map((name) => `{${name}, number}`), 'or')} instead`;

	return [problem('ambiguous-hash', message)];
}

// What is wrong inside one string, named but not located: where each one is written is the
// caller's business, which is the one holding the file the string came out of.
export function messageProblems(text, lang, { langs = [lang] } = {}) {
	let tokens;
	let params;

	try {
		tokens = parse(text);
		params = paramsOf(text);
	} catch (error) {
		if (!(error instanceof IcuSyntaxError)) {
			throw error;
		}

		const at = { line: error.line, col: error.col };

		return [problem('icu-syntax', `is not valid ICU: ${error.reason}`, { at })];
	}

	return [
		...widthProblems(text, langs),
		...hashProblems(tokens, params),
		...[...params].flatMap(([name, signature]) => argumentProblems(name, signature, lang)),
	];
}

const COUNTING_TYPES = new Set(['argument', 'function']);

// The number may be written further in: under a select, or under another plural, where it
// has to go by name because a # there belongs to that other plural.
function counts(tokens, argument, hash = true) {
	return tokens.some(
		(token) =>
			(hash && 'octothorpe' === token.type) ||
			(COUNTING_TYPES.has(token.type) && argument === token.arg) ||
			(token.cases ?? []).some((kase) =>
				counts(kase.tokens, argument, hash && 'select' === token.type),
			),
	);
}

function namesIn(tokens) {
	return tokens.flatMap((token) => [
		...(undefined === token.arg ? [] : [token.arg]),
		...(token.cases ?? []).flatMap((kase) => namesIn(kase.tokens)),
	]);
}

function strayIn(token) {
	return token.cases.flatMap((kase) => {
		const names = [...new Set(namesIn(kase.tokens))];
		const stray = names.filter((name) => name !== token.arg && !AMBIENT_PARAMS.has(name));

		return 0 === stray.length || counts(kase.tokens, token.arg)
			? []
			: [{ argument: token.arg, key: kase.key, stray }];
	});
}

function visit(tokens) {
	return tokens.flatMap((token) => [
		...('plural' === token.type ? strayIn(token) : []),
		...(token.cases ?? []).flatMap((kase) => visit(kase.tokens)),
	]);
}

function tokensOrNone(text) {
	try {
		return parse(text);
	} catch {
		return null;
	}
}

// A plural form that never writes its number and names another param instead: `{total} retos`
// under `count`. Nothing is broken, the application prints it as written, and "One challenge
// from {name}" is a form like any other. So it is a doubt and never an error.
export const strayParamsIn = (text) => visit(tokensOrNone(text) ?? []);

function strayGroups(text) {
	const groups = new Map();

	for (const { argument, key, stray } of strayParamsIn(text)) {
		const id = `${argument}:${stray.join(',')}`;
		const group = groups.get(id) ?? { argument, stray, keys: [] };

		group.keys.push(key);
		groups.set(id, group);
	}

	return [...groups.values()];
}

const quotedList = (keys) => listOf(keys.map((key) => `"${key}"`), 'and');

// Asked of the source language only: a translation that names a param its source does not is
// already a mismatch, and one that mirrors its source would repeat the doubt once per language.
export function strayProblems(text) {
	return strayGroups(text).map(({ argument, stray, keys }) => {
		const forms = `the ${quotedList(keys)} ${1 === keys.length ? 'form' : 'forms'}`;
		const message =
			`names ${listOf(stray.map(paramTag), 'and')} and never the number in ${forms} of ` +
			`${paramTag(argument)} — write # if the number belongs there`;

		return problem('stray-plural-param', message, { name: stray[0] });
	});
}
