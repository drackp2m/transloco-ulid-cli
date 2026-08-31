import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { AMBIENT_PARAMS, toPascalCase } from './config.mjs';
import { paramTypesOf } from './message.mjs';

const ENTRY_LINE = /^\t'([^']+)': \{$/;
const FIELD_LINE = /^\t\t(\w+): (.+);$/;

export const paramsFile = (scopeDir) => path.join(scopeDir, 'params.ts');

export const paramsName = (scopeName) => `${toPascalCase(scopeName)}I18nParams`;

export function readDeclaredParams(file) {
	const declared = new Map();

	if (!existsSync(file)) {
		return declared;
	}

	let current = null;

	for (const line of readFileSync(file, 'utf8').split('\n')) {
		const entry = ENTRY_LINE.exec(line);
		const field = FIELD_LINE.exec(line);

		if (entry) {
			current = new Map();
			declared.set(entry[1], current);
		} else if (field && current) {
			current.set(field[1], field[2]);
		}
	}

	return declared;
}

export function entryLineOf(text, key) {
	const lines = String(text ?? '').split('\n');
	const line = lines.findIndex((content) => content.startsWith(`\t'${key}': {`));

	return -1 === line ? {} : { line: line + 1, col: 2 };
}

// The offending field itself, not the heading it hangs from: an entry can carry
// enough params that its first line says nothing about which one is wrong.
export function fieldLineOf(text, key, name) {
	const at = entryLineOf(text, key);
	const lines = String(text ?? '').split('\n');

	for (let index = at.line ?? lines.length; FIELD_LINE.test(lines[index] ?? ''); index += 1) {
		if (FIELD_LINE.exec(lines[index])[1] === name) {
			return { line: index + 1, col: 3 };
		}
	}

	return at;
}

function fieldsOf(text, declared) {
	return [...paramTypesOf(text)]
		.filter(([name]) => !AMBIENT_PARAMS.has(name))
		.map(([name, icu]) => ({ name, type: icu ?? declared?.get(name) ?? 'string' }));
}

function collectEntries(scope, defaultLang, declared) {
	const data = scope.translations.get(defaultLang)?.data ?? {};
	const entries = [];

	for (const entry of scope.keys.entries) {
		const fields = fieldsOf(data[entry.ulid] ?? '', declared.get(entry.value));

		if (fields.length) {
			entries.push({ key: entry.value, fields });
		}
	}

	return entries;
}

function render(entries, name) {
	if (!entries.length) {
		return `export type ${name} = Record<never, never>;\n`;
	}

	const body = entries.map(({ key, fields }) => {
		const lines = fields.map((field) => `\t\t${field.name}: ${field.type};`);

		return [`\t'${key}': {`, ...lines, '\t};'].join('\n');
	});

	return `export interface ${name} {\n${body.join('\n')}\n}\n`;
}

const changed = (fields, current) =>
	undefined === current ||
	fields.length !== current.size ||
	fields.some(({ name, type }) => current.get(name) !== type);

// Which side each key disagrees on: what the source writes and params.ts has not
// learnt yet, what params.ts still declares after the source dropped it, and what
// both write under a type the ICU argument contradicts.
function driftSides(fields, current) {
	const declared = current ?? new Map();
	const names = fields.map(({ name }) => name);

	return {
		missing: names.filter((name) => !declared.has(name)),
		extra: [...declared.keys()].filter((name) => !names.includes(name)),
		retyped: fields
			.filter(({ name, type }) => declared.has(name) && declared.get(name) !== type)
			.map(({ name, type }) => ({ name, type, declared: declared.get(name) })),
	};
}

// Which keys the generated file disagrees on, so the report can point at each
// one instead of at the file as a whole.
function driftOf(entries, declared, text) {
	const expected = new Set(entries.map(({ key }) => key));

	return [
		...entries
			.filter(({ key, fields }) => changed(fields, declared.get(key)))
			.map(({ key, fields }) => ({
				key,
				removed: false,
				...driftSides(fields, declared.get(key)),
			})),
		...[...declared.keys()]
			.filter((key) => !expected.has(key))
			.map((key) => ({
				key,
				removed: true,
				...driftSides([], declared.get(key)),
				...entryLineOf(text, key),
			})),
	];
}

// A scope with no interpolation needs no params.ts, so the file is only rendered when it
// would hold something or already exists, where emptying it is what keeps it in step.
export function buildScopeParams(scope, defaultLang) {
	const file = paramsFile(scope.dir);
	const current = existsSync(file) ? readFileSync(file, 'utf8') : null;
	const declared = readDeclaredParams(file);
	const entries = collectEntries(scope, defaultLang, declared);
	const needed = 0 !== entries.length || null !== current;
	const content = needed ? render(entries, paramsName(scope.name)) : null;

	return {
		file,
		current,
		content,
		required: 0 !== entries.length,
		exists: null !== current,
		stale: null !== content && content !== current,
		drift: driftOf(entries, declared, current),
	};
}

export const buildParams = ({ scopes, defaultLang }) =>
	scopes.filter((scope) => scope.keys).map((scope) => buildScopeParams(scope, defaultLang));
