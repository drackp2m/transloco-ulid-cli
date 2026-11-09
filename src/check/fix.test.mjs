import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { after, describe, test } from 'node:test';

import {
	createCatalogue,
	findingsOf,
	linesOf,
	removeCatalogues,
	scopesOf,
	ulidOf,
} from '../testing/catalogue.mjs';

import { applyFix } from './fix.mjs';

const LANGS = ['en-GB', 'es-ES'];
const SAVE = { name: 'SAVE', texts: { 'en-GB': 'Save', 'es-ES': 'Guardar' } };
const GREET = { name: 'GREET', texts: { 'en-GB': 'Hello {name}', 'es-ES': 'Hola {name}' } };

after(removeCatalogues);

const catalogueWith = (keys, extra = {}) => createCatalogue({ langs: LANGS, keys, ...extra });

const fix = (catalogue) =>
	applyFix({
		scopes: scopesOf(catalogue),
		langs: catalogue.langs,
		defaultLang: catalogue.defaultLang,
		i18nDir: catalogue.i18nDir,
		importAlias: '@app/i18n',
	}).map((file) => path.relative(catalogue.root, file));

const read = (catalogue, ...parts) => readFileSync(path.join(catalogue.i18nDir, ...parts), 'utf8');

const writeJson = (file, data) => writeFileSync(file, `${JSON.stringify(data, null, '\t')}\n`);

const spanish = (catalogue) => JSON.parse(read(catalogue, 'demo', 'es-ES.json'));

describe('applyFix', () => {
	test('writes nothing in a catalogue that is already settled', () => {
		deepStrictEqual(fix(catalogueWith([SAVE, GREET])), []);
	});

	test('gives a missing translation its empty slot, which the check then only warns about', () => {
		const catalogue = catalogueWith([
			SAVE,
			{ name: 'DELETE', texts: { 'en-GB': 'Delete', 'es-ES': null } },
		]);

		deepStrictEqual(fix(catalogue), ['i18n/demo/es-ES.json']);
		deepStrictEqual(spanish(catalogue), { [ulidOf(0)]: 'Guardar', [ulidOf(1)]: '' });
		deepStrictEqual(linesOf(findingsOf(catalogue)), [
			`warning empty-translation [es-ES]: DELETE (${ulidOf(1)})`,
		]);
	});

	test('drops a translation no key declares', () => {
		const catalogue = catalogueWith([SAVE]);

		writeJson(path.join(catalogue.scopeDir, 'es-ES.json'), {
			[ulidOf(0)]: 'Guardar',
			[ulidOf(7)]: 'Huérfana',
		});

		deepStrictEqual(fix(catalogue), ['i18n/demo/es-ES.json']);
		deepStrictEqual(spanish(catalogue), { [ulidOf(0)]: 'Guardar' });
	});

	test('rewrites a language file in keys.ts order', () => {
		const catalogue = catalogueWith([SAVE, GREET]);

		writeJson(path.join(catalogue.scopeDir, 'es-ES.json'), {
			[ulidOf(1)]: 'Hola {name}',
			[ulidOf(0)]: 'Guardar',
		});
		fix(catalogue);

		deepStrictEqual(Object.keys(spanish(catalogue)), [ulidOf(0), ulidOf(1)]);
	});

	test('regenerates a params.ts that fell behind the source', () => {
		const params = 'export type DemoI18nParams = Record<never, never>;\n';
		const catalogue = catalogueWith([SAVE, GREET], { params });

		deepStrictEqual(fix(catalogue), ['i18n/demo/params.ts']);
		ok(read(catalogue, 'demo', 'params.ts').includes(`'demo.${ulidOf(1)}': {\n\t\tname: string;`));
	});

	test('registers a scope the barrel does not have, with its import', () => {
		const catalogue = catalogueWith([SAVE]);
		const dir = path.join(catalogue.i18nDir, 'other');

		mkdirSync(dir);
		writeFileSync(
			path.join(dir, 'keys.ts'),
			`export const OtherI18n = {\n\tOK: 'other.${ulidOf(5)}',\n} as const;\n`,
		);

		for (const lang of LANGS) {
			writeJson(path.join(dir, `${lang}.json`), { [ulidOf(5)]: 'OK' });
		}

		deepStrictEqual(fix(catalogue), ['i18n/index.ts']);

		const barrel = read(catalogue, 'index.ts');

		ok(barrel.includes("import { OtherI18n } from '@app/i18n/other/keys';"));
		ok(barrel.includes('\tdemo: DemoI18n,\n\tother: OtherI18n,\n} as const;'));
	});

	test('leaves a language file that does not parse for the check to report', () => {
		const catalogue = catalogueWith([SAVE]);

		writeFileSync(path.join(catalogue.scopeDir, 'es-ES.json'), '{ "broken": ');

		deepStrictEqual(fix(catalogue), []);
		strictEqual(read(catalogue, 'demo', 'es-ES.json'), '{ "broken": ');
	});

	test('settles the language files of a catalogue without a barrel, and leaves the barrel to the check', () => {
		const catalogue = catalogueWith([SAVE, { ...GREET, texts: { 'en-GB': 'Hello {name}', 'es-ES': null } }]);

		rmSync(path.join(catalogue.i18nDir, 'index.ts'));

		deepStrictEqual(fix(catalogue), ['i18n/demo/es-ES.json']);
	});

	test('drops the seal of a key that is no longer declared', () => {
		const catalogue = catalogueWith([{ ...SAVE, seal: true }]);
		const file = path.join(catalogue.i18nDir, 'state', 'demo.json');
		const state = JSON.parse(readFileSync(file, 'utf8'));

		writeJson(file, { ...state, [ulidOf(9)]: { 'es-ES': 'abcdefabcdef' } });

		deepStrictEqual(fix(catalogue), ['i18n/state/demo.json']);
		deepStrictEqual(Object.keys(JSON.parse(readFileSync(file, 'utf8'))), [ulidOf(0)]);
	});
});
