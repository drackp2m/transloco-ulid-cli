import {
	combosOf,
	dimensionsOf,
	leafFor,
	pathOf,
	segmentOf,
	shapeOf,
	sourceSegmentOf,
	suffixOf,
} from '../catalogue/forms.mjs';
import { buildFrom, leavesOf, placeholdersIn, sameParams } from '../catalogue/message.mjs';

const FORM_MARK = '#';
const PLURAL = 'plural';

const FLAT_ON_FORMS = 'the source branches now, so a flat translation cannot be merged';
const FORMS_ON_FLAT = 'the source does not branch, so a form cannot be merged';
const NOT_A_FORM = 'not a form this key has in this language';
const TWICE = 'came back more than once';

const problem = (file, message) => ({ file, message });

const isBlank = (text) => '' === String(text ?? '').trim();

const markersIn = (text, hash) => placeholdersIn(text, { hash }).map(({ name }) => name);

function sameMarkers(source, target, hash) {
	const from = new Set(markersIn(source, hash));
	const to = new Set(markersIn(target, hash));

	return from.size === to.size && [...from].every((name) => to.has(name));
}

export function idPartsOf(id) {
	const [head = '', ...forms] = String(id).split(FORM_MARK);

	return {
		head,
		ulid: head.split('.').pop(),
		suffix: forms.map((form) => `${FORM_MARK}${form}`).join(''),
	};
}

export function groupUnits(units) {
	const groups = new Map();

	for (const unit of units) {
		const { head, ulid, suffix } = idPartsOf(unit.id);
		const group = groups.get(ulid) ?? { head, ulid, units: [] };

		group.units.push({ ...unit, suffix });
		groups.set(ulid, group);
	}

	return [...groups.values()];
}

export const isFlatGroup = (group) => 1 === group.units.length && '' === group.units[0].suffix;

function expectedOf(source, lang) {
	const dimensions = dimensionsOf(source);

	if (null === dimensions || 0 === dimensions.length) {
		return null;
	}

	const leaves = leavesOf(source);

	return {
		shape: shapeOf(dimensions),
		hash: dimensions.some(({ type }) => PLURAL === type),
		forms: combosOf(dimensions, lang).map((combo) => ({
			suffix: suffixOf(combo),
			path: pathOf(combo, segmentOf),
			source: leafFor(leaves, pathOf(combo, sourceSegmentOf))?.text ?? leaves[0].text,
		})),
	};
}

function bySuffix(units) {
	const found = new Map();
	const problems = [];

	for (const unit of units) {
		if (found.has(unit.suffix)) {
			problems.push(problem(unit.id, TWICE));
		} else {
			found.set(unit.suffix, unit);
		}
	}

	return { found, problems };
}

function foldFlat(group, source, defaultLang) {
	const { found, problems } = bySuffix(group.units);
	const strays = [...found.values()].filter((unit) => '' !== unit.suffix);
	const unit = found.get('');
	const all = [...problems, ...strays.map((item) => problem(item.id, FORMS_ON_FLAT))];

	if (undefined === unit || isBlank(unit.target)) {
		return { target: '', empty: true, problems: all };
	}

	const marks = sameParams(source ?? unit.source, unit.target)
		? []
		: [problem(unit.id, `placeholders differ from ${defaultLang}`)];

	return { target: unit.target, empty: false, problems: [...all, ...marks] };
}

function strayProblems(found, expected) {
	const wanted = new Set(expected.forms.map((form) => form.suffix));

	return [...found.values()]
		.filter((unit) => !wanted.has(unit.suffix))
		.map((unit) => problem(unit.id, '' === unit.suffix ? FLAT_ON_FORMS : NOT_A_FORM));
}

function shortProblems(group, expected, missing) {
	if (missing.length === expected.forms.length) {
		return [];
	}

	const count = `${missing.length} of ${expected.forms.length} forms came back empty`;

	return [problem(group.head, `${count} — the key is left untouched`)];
}

function markerProblems(expected, found, defaultLang) {
	return expected.forms.flatMap((form) => {
		const unit = found.get(form.suffix);

		return sameMarkers(form.source, unit.target, expected.hash)
			? []
			: [problem(unit.id, `placeholders differ from ${defaultLang}`)];
	});
}

function foldForms(group, expected, defaultLang) {
	const { found, problems } = bySuffix(group.units);
	const all = [...problems, ...strayProblems(found, expected)];
	const missing = expected.forms.filter((form) => isBlank(found.get(form.suffix)?.target));

	if (0 !== missing.length) {
		const short = shortProblems(group, expected, missing);

		return { target: '', empty: true, problems: [...all, ...short] };
	}

	const marks = markerProblems(expected, found, defaultLang);
	const leaves = expected.forms.map(({ suffix, path }) => ({
		path,
		text: found.get(suffix).target,
	}));

	try {
		const target = buildFrom(leaves, expected.shape);

		return { target, empty: false, problems: [...all, ...marks] };
	} catch (error) {
		const broken = problem(group.head, `the forms do not rebuild — ${error.message}`);

		return { target: '', empty: true, problems: [...all, ...marks, broken] };
	}
}

export function foldGroup(group, { source, lang, defaultLang }) {
	const expected = expectedOf(source, lang);

	return null === expected
		? foldFlat(group, source, defaultLang)
		: foldForms(group, expected, defaultLang);
}
