import { childrenNamed, encodeXml, findAll, firstNamed, parseXml } from './xml.mjs';

const NAMESPACE = 'urn:oasis:names:tc:xliff:document:2.0';
const PARAM_PATTERN = /\{\{\s*([\w.]+)\s*\}\}/g;
const STATES = new Set(['initial', 'translated', 'reviewed', 'final']);

const indent = (depth) => '\t'.repeat(depth);

// One <data> per distinct interpolation, referenced from both sides: the
// translator sees an atomic placeholder chip instead of "{{ index }}" they can
// typo, and the import resolves it back to the exact original text.
function dataOf(texts) {
	const data = new Map();

	for (const text of texts) {
		for (const [match, name] of String(text ?? '').matchAll(PARAM_PATTERN)) {
			if (!data.has(name)) {
				data.set(name, { id: `d${data.size + 1}`, text: match });
			}
		}
	}

	return data;
}

function inlineOf(text, data, prefix) {
	const parts = [];
	let last = 0;
	let count = 0;

	for (const match of String(text).matchAll(PARAM_PATTERN)) {
		parts.push(encodeXml(text.slice(last, match.index)));
		count += 1;
		parts.push(`<ph id="${prefix}${count}" dataRef="${data.get(match[1]).id}"/>`);
		last = match.index + match[0].length;
	}

	parts.push(encodeXml(text.slice(last)));

	return parts.join('');
}

function originalDataOf(data, depth) {
	if (0 === data.size) {
		return [];
	}

	const entries = [...data.values()].map(
		({ id, text }) => `${indent(depth + 1)}<data id="${id}">${encodeXml(text)}</data>`,
	);

	return [`${indent(depth)}<originalData>`, ...entries, `${indent(depth)}</originalData>`];
}

function notesOf(notes, depth) {
	if (0 === notes.length) {
		return [];
	}

	const entries = notes.map(
		({ category, text }) =>
			`${indent(depth + 1)}<note category="${encodeXml(category)}">${encodeXml(text)}</note>`,
	);

	return [`${indent(depth)}<notes>`, ...entries, `${indent(depth)}</notes>`];
}

const subStateOf = (unit) =>
	undefined === unit.subState || null === unit.subState
		? ''
		: ` subState="${encodeXml(unit.subState)}"`;

function unitOf(unit, depth) {
	const data = dataOf([unit.source, unit.target]);
	const state = '' === String(unit.target ?? '').trim() ? 'initial' : (unit.state ?? 'translated');

	return [
		`${indent(depth)}<unit id="${encodeXml(unit.id)}">`,
		...notesOf(unit.notes ?? [], depth + 1),
		...originalDataOf(data, depth + 1),
		`${indent(depth + 1)}<segment state="${state}"${subStateOf(unit)}>`,
		`${indent(depth + 2)}<source>${inlineOf(unit.source ?? '', data, 's')}</source>`,
		`${indent(depth + 2)}<target>${inlineOf(unit.target ?? '', data, 't')}</target>`,
		`${indent(depth + 1)}</segment>`,
		`${indent(depth)}</unit>`,
	];
}

// The <file> notes carry what every unit below them shares — the app, the
// language, the scope and the glossary — so the block is allowed to be long
// where a unit note is not.
function fileOf(file, depth) {
	const original = undefined === file.original ? '' : ` original="${encodeXml(file.original)}"`;

	return [
		`${indent(depth)}<file id="${encodeXml(file.id)}"${original} xml:space="preserve">`,
		...notesOf(file.notes ?? [], depth + 1),
		...file.units.flatMap((unit) => unitOf(unit, depth + 1)),
		`${indent(depth)}</file>`,
	];
}

export function buildXliff({ srcLang, trgLang, files }) {
	const langs = `srcLang="${srcLang}" trgLang="${trgLang}"`;
	const header = `<xliff xmlns="${NAMESPACE}" version="2.0" ${langs}>`;

	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		header,
		...files.flatMap((file) => fileOf(file, 1)),
		'</xliff>',
		'',
	].join('\n');
}

// <ph> resolves through dataRef; anything else that can wrap text (<pc>, <mrk>)
// is transparent, and standalone codes we did not write are dropped.
function textOf(node, data) {
	return (node.children ?? [])
		.map((child) => {
			if ('#text' === child.name) {
				return child.text;
			}

			if ('ph' === child.name) {
				return data.get(child.attrs.dataRef) ?? '';
			}

			return ['pc', 'mrk'].includes(child.name) ? textOf(child, data) : '';
		})
		.join('');
}

function dataMapOf(unit) {
	const original = firstNamed(unit, 'originalData');
	const entries = null === original ? [] : childrenNamed(original, 'data');

	return new Map(entries.map((entry) => [entry.attrs.id, textOf(entry, new Map())]));
}

// A TMS may split one string across several <segment>s; joining them back in
// document order is what makes the round-trip lossless.
function segmentsOf(unit, data) {
	const segments = findAll(unit, 'segment');
	const read = (name) =>
		segments.map((segment) => {
			const node = firstNamed(segment, name);

			return null === node ? '' : textOf(node, data);
		});
	const states = segments
		.map((segment) => segment.attrs.state)
		.filter((state) => STATES.has(state));
	const subStates = segments
		.map((segment) => segment.attrs.subState)
		.filter((state) => undefined !== state);

	return { source: read('source').join(''), target: read('target').join(''), states, subStates };
}

const noteEntry = (note) => ({
	category: note.attrs.category ?? '',
	text: textOf(note, new Map()),
});

// Read from the element's own <notes> block rather than with findAll, which
// recurses: a <file> asked for its notes would otherwise collect every note of
// every unit below it.
function ownNotes(node) {
	const block = firstNamed(node, 'notes');

	return null === block ? [] : childrenNamed(block, 'note').map((note) => noteEntry(note));
}

function readUnit(unit) {
	const data = dataMapOf(unit);
	const { source, target, states, subStates } = segmentsOf(unit, data);
	const notes = findAll(unit, 'note').map((note) => noteEntry(note));

	return {
		id: unit.attrs.id ?? '',
		notes,
		source,
		target,
		state: states[0] ?? 'initial',
		subState: subStates[0] ?? null,
	};
}

export function readXliff(text) {
	const root = parseXml(text);
	const [document] = findAll(root, 'xliff');

	if (undefined === document) {
		throw new Error('not an XLIFF document — no <xliff> root');
	}

	return {
		srcLang: document.attrs.srcLang ?? null,
		trgLang: document.attrs.trgLang ?? null,
		files: findAll(document, 'file').map((file) => ({
			id: file.attrs.id ?? '',
			original: file.attrs.original ?? null,
			notes: ownNotes(file),
			units: findAll(file, 'unit').map((unit) => readUnit(unit)),
		})),
	};
}

export const noteOf = (unit, category) =>
	unit.notes.find((note) => note.category === category)?.text ?? null;
