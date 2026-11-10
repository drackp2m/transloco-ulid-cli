import {
	alignsWith,
	combosOf,
	dimensionsOf,
	isExactCase,
	labelOf,
	leafFor,
	pathOf,
	segmentOf,
	sourceSegmentOf,
	suffixOf,
} from '../catalogue/forms.mjs';
import { GENDER_ARG, genderNoteFor } from '../catalogue/genders.mjs';
import { leavesOf } from '../catalogue/message.mjs';
import { NOTE_TEXTS, fillNote } from '../catalogue/note-texts.mjs';
import { pluralExamplesOf } from '../catalogue/plurals.mjs';

const PLURAL = 'plural';

function leavesOrNone(text) {
	try {
		return leavesOf(text);
	} catch {
		return null;
	}
}

function siblingsOf(leaves, defaultLang) {
	if (2 > leaves.length) {
		return null;
	}

	const label = (leaf) => leaf.path.map((segment) => segment.split(':').pop()).join('+');
	const forms = leaves.map((leaf) => `${label(leaf)}: «${leaf.text}»`).join(' · ');

	return `${defaultLang} · ${forms}`;
}

const decimalList = (values, point) =>
	values.map((value) => String(value).replace('.', point)).join(' · ');

function examplesText(lang, key, texts) {
	if (isExactCase(key)) {
		return fillNote(texts.pluralExactly, { value: key.slice(1) });
	}

	const found = pluralExamplesOf(lang, key);

	if (null === found) {
		return null;
	}

	if (0 !== found.integers.length) {
		const numbers = `${found.integers.join(', ')}${found.more ? '…' : ''}`;

		return fillNote(texts.pluralNumbers, { numbers });
	}

	if (0 === found.decimals.length) {
		return null;
	}

	const numbers = decimalList(found.decimals, texts.decimalPoint);

	return fillNote(texts.pluralDecimals, { numbers });
}

function noteFor(category, text) {
	return null === text || undefined === text ? [] : [{ category, text }];
}

function formNotes(combo, { lang, texts }, siblings) {
	const plural = combo.find(({ dimension }) => PLURAL === dimension.type);
	const gender = combo.find(({ dimension }) => GENDER_ARG === dimension.arg);
	const examples = undefined === plural ? null : examplesText(lang, plural.key, texts);
	const genderNote = undefined === gender ? null : genderNoteFor(gender.key, lang, texts);

	return [
		{ category: 'category', text: combo.map(labelOf).join(' · ') },
		...noteFor('examples', examples),
		...noteFor('gender-note', genderNote),
		...noteFor('siblings', siblings),
	];
}

const flatForm = (source, target) => [{ suffix: '', source, target, hash: false, notes: [] }];

export function formsOf({ source, target, lang, defaultLang, noteTexts = NOTE_TEXTS }) {
	const leaves = leavesOrNone(source);
	const dimensions = null === leaves ? null : dimensionsOf(source);

	if (null === dimensions || 0 === dimensions.length) {
		return flatForm(source, target);
	}

	const targetLeaves = alignsWith(target, dimensions) ? (leavesOrNone(target) ?? []) : [];
	const siblings = siblingsOf(leaves, defaultLang);
	const hash = dimensions.some(({ type }) => PLURAL === type);

	return combosOf(dimensions, lang).map((combo) => ({
		suffix: suffixOf(combo),
		source: leafFor(leaves, pathOf(combo, sourceSegmentOf))?.text ?? leaves[0].text,
		target: leafFor(targetLeaves, pathOf(combo, segmentOf))?.text ?? '',
		hash,
		notes: formNotes(combo, { lang, texts: noteTexts }, siblings),
	}));
}
