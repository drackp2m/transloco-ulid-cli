import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, describe, test } from 'node:test';

import { buildScopeParams, readDeclaredParams } from './params.mjs';

const KEY = 'demo.01KZJ895M8N6WQ02RVEABREFT0';
const DIRS = [];

after(() => {
	for (const dir of DIRS) {
		rmSync(dir, { recursive: true, force: true });
	}
});

function scopeWith(values, current) {
	const dir = mkdtempSync(path.join(tmpdir(), 'i18n-params-'));
	const data = {};
	const entries = [];

	DIRS.push(dir);

	for (const [index, value] of values.entries()) {
		const ulid = `01KZJ895M8N6WQ02RVEABREFT${index}`;

		data[ulid] = value;
		entries.push({ name: `KEY_${index}`, value: `demo.${ulid}`, ulid });
	}

	if (undefined !== current) {
		writeFileSync(path.join(dir, 'params.ts'), current, 'utf8');
	}

	return {
		name: 'demo',
		dir,
		keys: { entries },
		translations: new Map([['es-ES', { data }]]),
	};
}

const fieldsOf = (content) => content.split('\n').filter((line) => line.startsWith('\t\t'));

const fileWith = (...fields) =>
	['export interface DemoI18nParams {', `\t'${KEY}': {`, ...fields, '\t};', '}', ''].join('\n');

describe('buildScopeParams', () => {
	test('writes string for a plain argument', () => {
		const built = buildScopeParams(scopeWith(['Hola {name}']), 'es-ES');

		deepStrictEqual(fieldsOf(built.content), ['\t\tname: string;']);
	});

	test('keeps a hand-written type for a plain argument', () => {
		const current = fileWith('\t\tlength: number;');
		const built = buildScopeParams(scopeWith(['Al menos {length} caracteres.'], current), 'es-ES');

		strictEqual(built.stale, false);
		deepStrictEqual(built.drift, []);
	});

	test('writes number for a plural, without anybody declaring it', () => {
		const value = '{count, plural, one {# ejercicio} other {# ejercicios}}';
		const built = buildScopeParams(scopeWith([value]), 'es-ES');

		deepStrictEqual(fieldsOf(built.content), ['\t\tcount: number;']);
	});

	test('writes the union of the select cases', () => {
		const value = '{status, select, ok {bien} ko {mal} other {?}}';
		const built = buildScopeParams(scopeWith([value]), 'es-ES');

		deepStrictEqual(fieldsOf(built.content), ["\t\tstatus: 'ok' | 'ko';"]);
	});

	test('leaves the ambient gender out of the file', () => {
		const value = '{gender, select, female {Lista} other {Listo}}, {name}';
		const built = buildScopeParams(scopeWith([value]), 'es-ES');

		deepStrictEqual(fieldsOf(built.content), ['\t\tname: string;']);
	});

	test('overrides a hand-written type the ICU argument contradicts', () => {
		const current = fileWith('\t\tcount: string;');
		const value = '{count, plural, one {#} other {#}}';
		const built = buildScopeParams(scopeWith([value], current), 'es-ES');

		strictEqual(built.stale, true);
		deepStrictEqual(fieldsOf(built.content), ['\t\tcount: number;']);
		deepStrictEqual(built.drift, [
			{
				key: KEY,
				removed: false,
				missing: [],
				extra: [],
				retyped: [{ name: 'count', type: 'number', declared: 'string' }],
			},
		]);
	});

	test('reports a name and a type moving on the same key', () => {
		const current = fileWith('\t\tcount: string;', '\t\tgone: string;');
		const value = '{count, plural, one {#} other {#}} de {total}';
		const built = buildScopeParams(scopeWith([value], current), 'es-ES');

		deepStrictEqual(built.drift, [
			{
				key: KEY,
				removed: false,
				missing: ['total'],
				extra: ['gone'],
				retyped: [{ name: 'count', type: 'number', declared: 'string' }],
			},
		]);
	});

	test('reports nothing to declare for a key that lost its params', () => {
		const current = fileWith('\t\tname: string;');
		const built = buildScopeParams(scopeWith(['Sin nada'], current), 'es-ES');

		deepStrictEqual(built.drift, [
			{
				key: KEY,
				removed: true,
				missing: [],
				extra: ['name'],
				retyped: [],
				line: 2,
				col: 2,
			},
		]);
	});
});

describe('readDeclaredParams', () => {
	test('reads back the types a union field was written with', () => {
		const current = fileWith("\t\tstatus: 'ok' | 'ko';");
		const scope = scopeWith(['{status, select, ok {a} ko {b} other {c}}'], current);
		const declared = readDeclaredParams(path.join(scope.dir, 'params.ts'));

		strictEqual(declared.get(KEY).get('status'), "'ok' | 'ko'");
	});
});
