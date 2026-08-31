import { GENDER_ARG, genderCategoriesOf, genderNoteFor } from '../catalogue/genders.mjs';
import { leavesOf, paramsOf } from '../catalogue/message.mjs';
import { pluralExamplesOf, requiredCategoriesOf } from '../catalogue/plurals.mjs';

const EXACT_CASE = /^=\d+$/;
const OTHER = 'other';
const PLURAL = 'plural';

function leavesOrNone(text) {
	try {
		return leavesOf(text);
	} catch {
		return null;
	}
}

function labelledDimensions(text) {
	const branching = [...paramsOf(text)]
		.filter(([, param]) => 'plain' !== param.type)
		.map(([arg, param]) => ({ arg, type: param.type, cases: param.cases }));

	if (branching.some(({ type }) => 'selectordinal' === type)) {
		return null;
	}

	const plurals = branching.filter(({ type }) => PLURAL === type).length;

	return branching.map((dimension) => ({
		...dimension,
		label: PLURAL === dimension.type && 1 === plurals ? PLURAL : dimension.arg,
	}));
}

function dimensionsOf(text) {
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

function categoriesOf(dimension, lang) {
	if (PLURAL !== dimension.type) {
		return GENDER_ARG === dimension.arg
			? genderCategoriesOf(lang, dimension.cases)
			: dimension.cases;
	}

	const exact = dimension.cases.filter((key) => EXACT_CASE.test(key));
	const declared = dimension.cases.filter((key) => !EXACT_CASE.test(key));

	return [...exact, ...(requiredCategoriesOf(lang) ?? declared)];
}

function combosOf(dimensions, lang) {
	let combos = [[]];

	for (const dimension of dimensions) {
		const keys = categoriesOf(dimension, lang);

		combos = combos.flatMap((combo) => keys.map((key) => [...combo, { dimension, key }]));
	}

	return combos;
}

const segmentOf = ({ dimension, key }) => `${dimension.type}:${key}`;

const sourceSegmentOf = ({ dimension, key }) =>
	EXACT_CASE.test(key) && dimension.cases.includes(key)
		? `${dimension.type}:${key}`
		: `${dimension.type}:${OTHER}`;

const leafFor = (leaves, wanted) =>
	leaves.find((leaf) => wanted.every((segment) => leaf.path.includes(segment))) ?? null;

function siblingsOf(leaves, defaultLang) {
	if (2 > leaves.length) {
		return null;
	}

	const label = (leaf) => leaf.path.map((segment) => segment.split(':').pop()).join('+');
	const forms = leaves.map((leaf) => `${label(leaf)}: «${leaf.text}»`).join(' · ');

	return `${defaultLang} · ${forms}`;
}

const decimalList = (values) => values.map((value) => String(value).replace('.', ',')).join(' · ');

function examplesText(lang, key) {
	if (EXACT_CASE.test(key)) {
		return `se usa exactamente con ${key.slice(1)}`;
	}

	const found = pluralExamplesOf(lang, key);

	if (null === found) {
		return null;
	}

	if (0 !== found.integers.length) {
		return `se usa con ${found.integers.join(', ')}${found.more ? '…' : ''}`;
	}

	if (0 === found.decimals.length) {
		return 'ningún número la selecciona, pero ICU la exige de todas formas';
	}

	return (
		`sólo la alcanzan los decimales: ${decimalList(found.decimals)}. ` +
		'Es obligatoria aunque no se vea nunca'
	);
}

function noteFor(category, text) {
	return null === text || undefined === text ? [] : [{ category, text }];
}

const labelOf = ({ dimension, key }) => `${dimension.label}:${key}`;

function formNotes(combo, lang, siblings) {
	const plural = combo.find(({ dimension }) => PLURAL === dimension.type);
	const gender = combo.find(({ dimension }) => GENDER_ARG === dimension.arg);

	return [
		{ category: 'category', text: combo.map(labelOf).join(' · ') },
		...noteFor('examples', undefined === plural ? null : examplesText(lang, plural.key)),
		...noteFor('gender-note', undefined === gender ? null : genderNoteFor(gender.key, lang)),
		...noteFor('siblings', siblings),
	];
}

const flatForm = (source, target) => [{ suffix: '', source, target, hash: false, notes: [] }];

export function formsOf({ source, target, lang, defaultLang }) {
	const leaves = leavesOrNone(source);
	const dimensions = null === leaves ? null : dimensionsOf(source);

	if (null === dimensions || 0 === dimensions.length) {
		return flatForm(source, target);
	}

	const targetLeaves = leavesOrNone(target) ?? [];
	const siblings = siblingsOf(leaves, defaultLang);
	const hash = dimensions.some(({ type }) => PLURAL === type);

	return combosOf(dimensions, lang).map((combo) => ({
		suffix: combo.map((step) => `#${labelOf(step)}`).join(''),
		source: leafFor(leaves, combo.map(sourceSegmentOf))?.text ?? leaves[0].text,
		target: leafFor(targetLeaves, combo.map(segmentOf))?.text ?? '',
		hash,
		notes: formNotes(combo, lang, siblings),
	}));
}
