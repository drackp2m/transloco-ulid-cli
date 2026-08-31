import { formCountOf, isExactCase } from '../catalogue/forms.mjs';
import { GENDER_ARG, GENDER_VALUES } from '../catalogue/genders.mjs';
import { IcuSyntaxError, paramTag, paramsOf } from '../catalogue/message.mjs';
import { cardinalCategoriesOf, requiredCategoriesOf } from '../catalogue/plurals.mjs';

const OTHER = 'other';

// Gender crossed with a plural is 12 forms in Russian, and 12 is already a lot to hand a
// translator for one sentence. Past that the string is asking to be split in two, not
// fanned out wider.
const MAX_FORMS = 12;

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
function widthProblems(text, lang) {
	const count = formCountOf(text, lang);

	if (MAX_FORMS >= count) {
		return [];
	}

	const message =
		`opens into ${count} forms in "${lang}", over the ${MAX_FORMS} allowed — ` +
		'split the sentence instead of branching it further';

	return [problem('too-many-forms', message)];
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

	return [
		...widthProblems(text, lang),
		...[...params].flatMap(([name, signature]) => argumentProblems(name, signature, lang)),
	];
}
