// CLDR is the authority on which plural categories a language declares, so the table comes
// from `Intl.PluralRules` instead of being copied by hand. What it cannot say is which of
// them the application can ever reach: `es`, `ca`, `fr`, `it` and `pt` declare `many` only
// for compact millions ("1 M"), a notation nothing here formats, so asking a translator for
// that form is asking for a string nobody will ever read. Hence the whitelist below is what
// a plain integer count selects, plus `other`, which ICU requires even where no integer
// reaches it — in Russian only a decimal does.
const COUNTABLE_LIMIT = 1000;

const TABLES = new Map();

const baseOf = (lang) => String(lang).split('-')[0].toLowerCase();

// A tag CLDR does not know resolves to the default locale, and answering with English
// categories for it would be worse than answering nothing at all.
function rulesOf(lang) {
	try {
		const rules = new Intl.PluralRules(lang);

		return baseOf(rules.resolvedOptions().locale) === baseOf(lang) ? rules : null;
	} catch {
		return null;
	}
}

function buildTable(lang) {
	const rules = rulesOf(lang);

	if (null === rules) {
		return null;
	}

	const { pluralCategories } = rules.resolvedOptions();
	const reachable = new Set(['other']);

	for (let count = 0; count <= COUNTABLE_LIMIT; count += 1) {
		reachable.add(rules.select(count));
	}

	return {
		cardinal: pluralCategories,
		required: pluralCategories.filter((category) => reachable.has(category)),
	};
}

function tableOf(lang) {
	if (!TABLES.has(lang)) {
		TABLES.set(lang, buildTable(lang));
	}

	return TABLES.get(lang);
}

export const cardinalCategoriesOf = (lang) => tableOf(lang)?.cardinal ?? null;

export const requiredCategoriesOf = (lang) => tableOf(lang)?.required ?? null;

const EXAMPLE_LIMIT = 5;

const DECIMAL_PROBES = [0.5, 1.5, 2.5];

function integerExamples(rules, category) {
	const found = [];

	for (let count = 0; count <= COUNTABLE_LIMIT && found.length <= EXAMPLE_LIMIT; count += 1) {
		if (category === rules.select(count)) {
			found.push(count);
		}
	}

	return found;
}

export function pluralExamplesOf(lang, category) {
	const rules = rulesOf(lang);

	if (null === rules) {
		return null;
	}

	const found = integerExamples(rules, category);

	return {
		integers: found.slice(0, EXAMPLE_LIMIT),
		more: found.length > EXAMPLE_LIMIT,
		decimals: DECIMAL_PROBES.filter((value) => category === rules.select(value)),
	};
}
