import { IcuSyntaxError, paramTag, paramsOf } from '../catalogue/message.mjs';
import { cardinalCategoriesOf, requiredCategoriesOf } from '../catalogue/plurals.mjs';

const EXACT_CASE = /^=\d+$/;
const OTHER = 'other';

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
		.filter((key) => !EXACT_CASE.test(key) && !declared.includes(key))
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
		: missingOther;
}

// What is wrong inside one string, named but not located: where each one is written is the
// caller's business, which is the one holding the file the string came out of.
export function messageProblems(text, lang) {
	let params;

	try {
		params = paramsOf(text);
	} catch (error) {
		if (!(error instanceof IcuSyntaxError)) {
			throw error;
		}

		const at = { line: error.line, col: error.col };

		return [problem('icu-syntax', `is not valid ICU: ${error.reason}`, { at })];
	}

	return [...params].flatMap(([name, signature]) => argumentProblems(name, signature, lang));
}
