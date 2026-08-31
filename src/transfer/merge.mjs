import { readFileSync, writeFileSync } from 'node:fs';

import { isUlid } from '../catalogue/config.mjs';
import { hashOf, readState, sealed, writeState } from '../catalogue/freshness.mjs';

import { foldGroup, groupUnits, isFlatGroup } from './regroup.mjs';
import { noteOf } from './xliff.mjs';

const KEYS_END = '} as const;';
const KEY_NAME = /^[A-Z][A-Z0-9_]*$/;
const NAME_MAX_LENGTH = 40;
const UNKNOWN_FORMS = 'the key is not in keys.ts, so its forms cannot be recomposed';

export const unitRef = (scope, ulid) => `${scope}:${ulid}`;

const problem = (file, message) => ({ file, message });

function slugOf(text) {
	const slug = String(text)
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, NAME_MAX_LENGTH)
		.replace(/_+$/, '');

	return KEY_NAME.test(slug) ? slug : '';
}

// The exported note carries the constant the key had, so a round-trip keeps its
// name; a unit a translator invented falls back to a slug of its source text.
function nameFor(unit, ulid, taken) {
	const fromNote = noteOf(unit, 'key')?.split('.').pop() ?? '';
	const base = KEY_NAME.test(fromNote) ? fromNote : slugOf(unit.source) || `KEY_${ulid.slice(-6)}`;
	let name = base;
	let index = 1;

	while (taken.has(name)) {
		index += 1;
		name = `${base}_${index}`;
	}

	taken.add(name);

	return name;
}

const addedOf = (unit, ulid, { scope, taken, lang }) => ({
	scope: scope.name,
	ulid,
	lang,
	name: nameFor(unit, ulid, taken),
	source: unit.source,
	target: unit.target,
});

function sealingOf(unit, ulid, entry, context) {
	const { scope, lang, source } = context;
	const hash = hashOf(source[ulid] ?? '');
	const declared = noteOf(unit, 'srcHash');

	if (null !== declared && declared !== hash) {
		return { outdated: { scope: scope.name, ulid, key: entry.name, lang } };
	}

	return { seal: { scope: scope.name, ulid, lang, hash } };
}

const updateOf = (ulid, entry, context, to) => ({
	scope: context.scope.name,
	ulid,
	key: entry.name,
	lang: context.lang,
	from: context.current[ulid] ?? '',
	to,
});

function newKeyOutcome(group, context) {
	if (!isFlatGroup(group)) {
		return { kind: 'problem', problem: problem(group.head, UNKNOWN_FORMS) };
	}

	return { kind: 'added', added: addedOf(group.units[0], group.ulid, context) };
}

function groupOutcome(group, context) {
	const { scope, lang, current, source } = context;
	const { ulid, head } = group;

	if (!isUlid(ulid)) {
		return { kind: 'problem', problem: problem(head, 'id is not a ULID') };
	}

	const entry = scope.keys?.entries.find((item) => item.ulid === ulid);

	if (undefined === entry) {
		return newKeyOutcome(group, context);
	}

	const { target, empty, problems } = foldGroup(group, {
		source: source[ulid],
		lang,
		defaultLang: scope.defaultLang,
	});

	if (empty) {
		return { kind: 'empty', problems };
	}

	const sealing = sealingOf(group.units[0], ulid, entry, context);

	if (target === (current[ulid] ?? '')) {
		return { kind: 'unchanged', ...sealing, problems };
	}

	return { kind: 'update', ...sealing, problems, update: updateOf(ulid, entry, context, target) };
}

function collect(result, outcome) {
	result.problems.push(...(outcome.problems ?? []));

	if (outcome.seal) {
		result.seals.push(outcome.seal);
	}

	if (outcome.outdated) {
		result.outdated.push(outcome.outdated);
	}

	if ('unchanged' === outcome.kind || 'empty' === outcome.kind) {
		result[outcome.kind] += 1;
	} else if ('problem' === outcome.kind) {
		result.problems.push(outcome.problem);
	} else if ('added' === outcome.kind) {
		result.added.push(outcome.added);
	} else {
		result.updates.push(outcome.update);
	}
}

function readUnits(scope, file, lang, taken) {
	const context = {
		scope,
		lang,
		taken,
		current: scope.translations.get(lang)?.data ?? {},
		source: scope.translations.get(scope.defaultLang)?.data ?? {},
	};
	const result = {
		updates: [],
		unchanged: 0,
		empty: 0,
		added: [],
		problems: [],
		seals: [],
		outdated: [],
	};

	for (const group of groupUnits(file.units)) {
		collect(result, groupOutcome(group, context));
	}

	return result;
}

function mergeInto(plan, part, lang) {
	const counts = plan.counts.get(lang) ?? { updated: 0, unchanged: 0, empty: 0 };

	plan.updates.push(...part.updates);
	plan.added.push(...part.added);
	plan.problems.push(...part.problems);
	plan.seals.push(...part.seals);
	plan.outdated.push(...part.outdated);
	plan.counts.set(lang, {
		updated: counts.updated + part.updates.length,
		unchanged: counts.unchanged + part.unchanged,
		empty: counts.empty + part.empty,
	});
}

function readDocument({ file, xliff }, plan, context) {
	const { scopes, defaultLang, taken } = context;

	plan.langs.add(xliff.trgLang);

	for (const entry of xliff.files) {
		const scope = scopes.find((item) => item.name === entry.id);

		if (undefined === scope) {
			plan.problems.push(problem(file, `unknown scope "${entry.id}"`));

			continue;
		}

		if (!taken.has(scope.name)) {
			taken.set(scope.name, new Set((scope.keys?.entries ?? []).map((item) => item.name)));
		}

		const names = taken.get(scope.name);

		const part = readUnits({ ...scope, defaultLang }, entry, xliff.trgLang, names);

		mergeInto(plan, part, xliff.trgLang);
	}
}

export function planImport({ scopes, langs, defaultLang, documents }) {
	const plan = {
		updates: [],
		added: [],
		problems: [],
		seals: [],
		outdated: [],
		counts: new Map(),
		langs: new Set(),
	};
	const context = { scopes, defaultLang, taken: new Map() };

	for (const document of documents) {
		const lang = document.xliff.trgLang;

		if (langs.includes(lang)) {
			readDocument(document, plan, context);
		} else {
			plan.problems.push(problem(document.file, `trgLang "${lang}" is not a language here`));
		}
	}

	return plan;
}

function appendKeys(scope, added) {
	const text = readFileSync(scope.keysFile, 'utf8');
	const end = text.lastIndexOf(KEYS_END);

	if (-1 === end) {
		throw new Error(`cannot find "${KEYS_END}" in ${scope.keysFile}`);
	}

	const lines = added.map(({ name, ulid }) => {
		const value = scope.prefixed ? `${scope.name}.${ulid}` : ulid;

		return `\t${name}: '${value}',\n`;
	});

	writeFileSync(scope.keysFile, `${text.slice(0, end)}${lines.join('')}${text.slice(end)}`, 'utf8');

	return scope.keysFile;
}

// Written in keys.ts order, the way `i18n:check --fix` would, so an import never
// leaves the catalogue in a shape the next check wants to rewrite.
function writeTranslation(scope, lang, order, values) {
	const translation = scope.translations.get(lang);
	const data = translation?.data ?? {};
	const next = Object.fromEntries(order.map((ulid) => [ulid, values[ulid] ?? data[ulid] ?? '']));
	const content = `${JSON.stringify(next, null, '\t')}\n`;

	if (undefined === translation || content === translation.text) {
		return null;
	}

	writeFileSync(translation.file, content, 'utf8');

	return translation.file;
}

function valuesFor({ plan, accepted, scope, lang, defaultLang }) {
	const values = {};
	const mine = (item) => item.scope === scope.name;

	for (const update of plan.updates.filter((item) => mine(item) && item.lang === lang)) {
		values[update.ulid] = update.to;
	}

	for (const entry of accepted.filter(mine)) {
		values[entry.ulid] = lang === defaultLang ? entry.source : entry.target;
	}

	return values;
}

function writeSeals(scope, added, { plan, i18nDir, langs }) {
	const entries = [
		...scope.keys.entries,
		...added.map(({ name, ulid }) => ({ name, ulid, value: ulid })),
	];
	const mine = plan.seals.filter((seal) => seal.scope === scope.name);
	const fresh = added
		.filter((entry) => '' !== String(entry.target ?? '').trim())
		.map((entry) => ({ ulid: entry.ulid, lang: entry.lang, hash: hashOf(entry.source) }));
	const state = readState(i18nDir, scope.name);
	const data = sealed(state.data, [...mine, ...fresh]);

	return writeState({ ...scope, keys: { ...scope.keys, entries } }, { i18nDir, langs, data });
}

function applyScope(scope, context) {
	const { plan, accepted, defaultLang, writeLangs } = context;
	const added = accepted.filter((entry) => entry.scope === scope.name);
	const written = 0 === added.length ? [] : [appendKeys(scope, added)];
	const existing = scope.keys.entries.filter((entry) => isUlid(entry.ulid));
	const order = [...existing.map((entry) => entry.ulid), ...added.map((entry) => entry.ulid)];

	for (const lang of writeLangs) {
		const values = valuesFor({ plan, accepted, scope, lang, defaultLang });
		const file = writeTranslation(scope, lang, order, values);

		if (null !== file) {
			written.push(file);
		}
	}

	const state = writeSeals(scope, added, context);

	return null === state ? written : [...written, state];
}

export function applyImport({ plan, scopes, defaultLang, accepted, langs, i18nDir }) {
	const extra = 0 === accepted.length ? [] : [defaultLang];
	const writeLangs = [...new Set([...plan.langs, ...extra])];
	const touched = (scope) =>
		accepted.some((entry) => entry.scope === scope.name) ||
		plan.updates.some((update) => update.scope === scope.name) ||
		plan.seals.some((seal) => seal.scope === scope.name);

	return scopes
		.filter((scope) => scope.keys && touched(scope))
		.flatMap((scope) =>
			applyScope(scope, { plan, accepted, defaultLang, writeLangs, langs, i18nDir }),
		);
}
