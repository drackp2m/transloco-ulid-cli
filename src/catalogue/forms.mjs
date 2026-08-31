import { GENDER_ARG, genderCategoriesOf } from './genders.mjs';
import { CATEGORY_ORDER, paramsOf } from './message.mjs';
import { requiredCategoriesOf } from './plurals.mjs';

const EXACT_CASE = /^=\d+$/;
const OTHER = 'other';
const PLURAL = 'plural';

export const isExactCase = (key) => EXACT_CASE.test(key);

// `leavesOf` walks the tokens in the same order `paramsOf` does — a parent before the
// branches it wraps, siblings left to right — so the position a dimension holds in that
// walk is the position its segment holds in every leaf path. What the fan-out shows is
// another order entirely (gender first, plural last), and `level` is what keeps the two
// from being taken for one another.
function labelledDimensions(text) {
	const branching = [...paramsOf(text)]
		.filter(([, param]) => 'plain' !== param.type)
		.map(([arg, param], level) => ({ arg, type: param.type, cases: param.cases, level }));

	if (branching.some(({ type }) => 'selectordinal' === type)) {
		return null;
	}

	const plurals = branching.filter(({ type }) => PLURAL === type).length;

	return branching.map((dimension) => ({
		...dimension,
		label: PLURAL === dimension.type && 1 === plurals ? PLURAL : dimension.arg,
	}));
}

// Null means "this string does not fan out": it does not parse, or it carries a
// selectordinal, which `i18n:check` rejects and which has categories of its own.
export function dimensionsOf(text) {
	let labelled;

	try {
		labelled = labelledDimensions(text);
	} catch {
		return null;
	}

	if (null === labelled) {
		return null;
	}

	return [
		...labelled.filter(({ type }) => PLURAL !== type),
		...labelled.filter(({ type }) => PLURAL === type),
	];
}

export function categoriesOf(dimension, lang) {
	if (PLURAL !== dimension.type) {
		return GENDER_ARG === dimension.arg
			? genderCategoriesOf(lang, dimension.cases)
			: dimension.cases;
	}

	const exact = dimension.cases.filter(isExactCase);
	const declared = dimension.cases.filter((key) => !isExactCase(key));

	return [...exact, ...(requiredCategoriesOf(lang) ?? declared)];
}

export function combosOf(dimensions, lang) {
	let combos = [[]];

	for (const dimension of dimensions) {
		const keys = categoriesOf(dimension, lang);

		combos = combos.flatMap((combo) => keys.map((key) => [...combo, { dimension, key }]));
	}

	return combos;
}

// The same arithmetic as `combosOf` without building the combinations, so a rule can ask
// how wide a string opens in a language without paying for the fan-out itself.
export function formCountOf(text, lang) {
	const dimensions = dimensionsOf(text);

	if (null === dimensions) {
		return 1;
	}

	return dimensions.reduce((count, dimension) => count * categoriesOf(dimension, lang).length, 1);
}

export const labelOf = ({ dimension, key }) => `${dimension.label}:${key}`;

export const suffixOf = (combo) => combo.map((step) => `#${labelOf(step)}`).join('');

export const segmentOf = ({ dimension, key }) => `${dimension.type}:${key}`;

// A plural asks the target language for categories the source may not have — Spanish has no
// `few` to show — and there the generic `other` is the only honest answer. A select is the
// other way round: what is asked is always among what the source declares, because the
// categories come from its own cases, so answering `other` would hand the translator a
// different sentence from the one being asked for.
export const sourceSegmentOf = (step) =>
	step.dimension.cases.includes(step.key) ? segmentOf(step) : `${step.dimension.type}:${OTHER}`;

// A leaf path carries one segment per level in source order, so a combo has to be laid back
// out by `level` before the two can be compared.
export function pathOf(combo, segmentFor) {
	const path = [];

	for (const step of combo) {
		path[step.dimension.level] = segmentFor(step);
	}

	return path;
}

// Matching on what the leaf has rather than on the whole path is what keeps a string whose
// branches are not symmetric findable: when `one` wraps a select and `other` does not, the
// `other` leaf is one level short and still the leaf that answers.
export const leafFor = (leaves, path) =>
	leaves.find((leaf) => leaf.path.every((segment, index) => segment === path[index])) ?? null;

const levelledTypes = (dimensions) =>
	[...dimensions]
		.sort((left, right) => left.level - right.level)
		.map(({ type, arg }) => `${type}:${arg}`);

// Two strings line up when they open the same way: the same arguments, of the same kind, at
// the same levels. A stored translation that is still flat text has no leaf that answers for
// any one form — and a leaf with no path at all matches every path it is held against, so
// without this gate the whole fan-out would come back prefilled with the same old sentence.
export function alignsWith(text, dimensions) {
	const found = dimensionsOf(text);

	if (null === found || found.length !== dimensions.length) {
		return false;
	}

	const wanted = levelledTypes(dimensions);

	return levelledTypes(found).every((entry, index) => entry === wanted[index]);
}

// A plural is written in CLDR's order, because the target asks for categories the source
// never declared; a select has no order but the one the source gives it, so recomposing
// alphabetically would leave every translated file shaped unlike the Spanish it came from.
const orderOf = ({ type, cases }) =>
	PLURAL === type ? [...cases.filter(isExactCase), ...CATEGORY_ORDER] : cases;

// `buildFrom` nests its shape in path order, which is the source's and not the fan-out's:
// recomposing from the display order would write the branches inside out.
export const shapeOf = (dimensions) =>
	[...dimensions]
		.sort((left, right) => left.level - right.level)
		.map((dimension) => ({
			type: dimension.type,
			arg: dimension.arg,
			order: orderOf(dimension),
		}));
