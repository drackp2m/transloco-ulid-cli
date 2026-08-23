import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { isUlid } from '../catalogue/config.mjs';
import { readContext, termsIn } from '../catalogue/context.mjs';
import { hashOf, readStates, statusOf } from '../catalogue/freshness.mjs';
import { paramsFile, readDeclaredParams } from '../catalogue/params.mjs';

import { buildXliff } from './xliff.mjs';

export const DEFAULT_OUT_DIR = 'translations';

export const OUTDATED_SUB_STATE = 'chesspecker:outdated';

const OUTDATED_NOTE =
	'the source changed after this was translated — the target below is the old translation';

const KEEPERS = {
	all: () => true,
	missing: (status) => 'missing' === status,
	stale: (status) => 'stale' === status,
	pending: (status) => 'missing' === status || 'stale' === status,
};

export const xliffFileName = (lang) => `${lang}.xlf`;

function relativise(file, root) {
	if (null === root || undefined === file || null === file) {
		return file;
	}

	return path.relative(root, file);
}

const usageNote = (usages, scope, name, root) => {
	const files = usages?.get(`${scope}:${name}`) ?? [];

	if (0 === files.length) {
		return [];
	}

	const text = [...new Set(files)].map((file) => relativise(file, root)).join(', ');

	return [{ category: 'usage', text }];
};

const paramNote = (declared, key) => {
	const fields = declared.get(key);

	if (undefined === fields) {
		return [];
	}

	const text = [...fields].map(([name, type]) => `{{ ${name} }}: ${type}`).join(', ');

	return [{ category: 'param', text }];
};

const UNIT_LEVELS = new Set(['group', 'key']);
const FILE_LEVELS = new Set(['app', 'language', 'scope']);

const termLine = (term, lang) => {
	const target = term.translations?.[lang];

	return `${term.term}${undefined === target ? '' : ` → ${target}`}`;
};

// The whole scope's vocabulary, once per <file>: the term, what it has to
// become in this language, and why it is in the glossary at all.
function glossaryNote({ glossary }, sources, lang) {
	const lines = termsIn(glossary, sources).map((term) => {
		const note = undefined === term.note ? '' : ` — ${term.note}`;

		return `${termLine(term, lang)}${note}`;
	});
	const keep = glossary.keep ?? [];

	if (0 !== keep.length) {
		lines.push(`No traducir nunca: ${keep.join(', ')}`);
	}

	return 0 === lines.length ? [] : [{ category: 'glossary', text: lines.join('\n') }];
}

// What every unit of the file shares. The layers below these — the group and
// the key — belong to the unit, which is what keeps a unit note short.
function fileNotes(scope, { context, lang, units }) {
	const layers = context
		.contextFor(scope.name, '', lang)
		.filter((layer) => FILE_LEVELS.has(layer.level));
	const notes = layers.map(({ level, text }) => ({ category: level, text }));
	const sources = units.map((unit) => unit.source);

	return [...notes, ...glossaryNote(context, sources, lang)];
}

// Everything the translator needs to place the string without opening the repo:
// the constant they would type in the code, where it is rendered, the type
// behind each placeholder, what the key is for and which terms it is bound to.
function notesFor(scope, entry, options) {
	const { declared, usages, root, context, lang, source } = options;
	const terms = termsIn(context.glossary, [source]);
	const layers = context
		.contextFor(scope.name, entry.name, lang)
		.filter((layer) => UNIT_LEVELS.has(layer.level));

	return [
		{ category: 'key', text: `${scope.keys.constName}.${entry.name}` },
		...paramNote(declared, entry.value),
		...usageNote(usages, scope.name, entry.name, root),
		...layers.map(({ text }) => ({ category: 'context', text })),
		...(0 === terms.length
			? []
			: [{ category: 'term', text: terms.map((term) => termLine(term, lang)).join(', ') }]),
	];
}
// --blank hands the unit over as if it had never been translated: the note and
// the sub-state that describe the old target go with it, so nothing in the file
// can seed a machine translator or pass for its answer.

function unitFor(scope, entry, options) {
	const { source, target, state, lang, blank } = options;
	const text = source[entry.ulid] ?? '';
	const value = target[entry.ulid] ?? '';
	const status = statusOf(state, entry.ulid, lang, text, value);
	const outdated = 'stale' === status && !blank;

	return {
		id: entry.value,
		notes: [
			...(outdated ? [{ category: 'outdated', text: OUTDATED_NOTE }] : []),
			...notesFor(scope, entry, { ...options, source: text }),
			{ category: 'srcHash', text: hashOf(text) },
		],
		source: text,
		target: blank ? '' : value,
		status,
		...(outdated ? { state: 'initial', subState: OUTDATED_SUB_STATE } : {}),
	};
}

function unitsOf(scope, options) {
	const { defaultLang, lang, filter, usages, root, context, state, blank } = options;
	const source = scope.translations.get(defaultLang)?.data ?? {};
	const target = scope.translations.get(lang)?.data ?? {};
	const declared = readDeclaredParams(paramsFile(scope.dir));
	const shared = { declared, usages, root, context, lang, source, target, state, blank };
	const keep = KEEPERS[filter] ?? KEEPERS.all;

	return scope.keys.entries
		.filter((entry) => isUlid(entry.ulid))
		.map((entry) => unitFor(scope, entry, shared))
		.filter((unit) => keep(unit.status));
}

function fileOf(scope, options) {
	const { lang, root, context } = options;
	const units = unitsOf(scope, options);

	return {
		id: scope.name,
		original: relativise(scope.translations.get(lang)?.file ?? scope.keysFile, root),
		notes: fileNotes(scope, { context, lang, units }),
		units,
	};
}

function countOf(files, status) {
	const matching = (file) => file.units.filter((unit) => status === unit.status).length;

	return files.reduce((count, file) => count + matching(file), 0);
}

export function buildExport(options) {
	const { scopes, defaultLang, lang, filter, usages, only, root = null, blank = false } = options;
	const context = options.context ?? readContext(options);
	const wanted = scopes.filter(
		(scope) => scope.keys && (!only?.length || only.includes(scope.name)),
	);
	const states = options.states ?? readStates(options.i18nDir, wanted);
	const shared = { defaultLang, lang, filter, usages, root, context, blank };
	const files = wanted
		.map((scope) => fileOf(scope, { ...shared, state: states.get(scope.name) }))
		.filter((file) => 0 !== file.units.length);

	return {
		lang,
		files,
		total: files.reduce((count, file) => count + file.units.length, 0),
		untranslated: countOf(files, 'missing'),
		outdated: countOf(files, 'stale'),
		content: buildXliff({ srcLang: defaultLang, trgLang: lang, files }),
	};
}

export function writeExport(document, outDir) {
	const file = path.join(outDir, xliffFileName(document.lang));

	mkdirSync(outDir, { recursive: true });
	writeFileSync(file, document.content, 'utf8');

	return { ...document, file };
}

export function exportLangs({ langs, defaultLang }, requested) {
	const targets = requested?.length ? requested : langs.filter((lang) => lang !== defaultLang);
	const unknown = targets.filter((lang) => !langs.includes(lang));

	if (0 !== unknown.length) {
		throw new Error(`unknown language(s): ${unknown.join(', ')}`);
	}

	return targets.filter((lang) => lang !== defaultLang);
}
