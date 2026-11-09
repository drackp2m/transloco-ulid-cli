import { deepStrictEqual } from 'node:assert/strict';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { after, describe, test } from 'node:test';

import {
	createCatalogue,
	findingsOf,
	linesOf,
	removeCatalogues,
	ulidOf,
} from '../testing/catalogue.mjs';

const LANGS = ['en-GB', 'es-ES'];
const ULID = ulidOf(0);
const SAVE = { name: 'SAVE', texts: { 'en-GB': 'Save', 'es-ES': 'Guardar' } };
const GREET = { name: 'GREET', texts: { 'en-GB': 'Hello {name}', 'es-ES': 'Hola {name}' } };
const COUNT = {
	name: 'COUNT',
	texts: {
		'en-GB': '{count, plural, one {# move} other {# moves}}',
		'es-ES': '{count, plural, one {# jugada} other {# jugadas}}',
	},
};

after(removeCatalogues);

const catalogueWith = (keys = [SAVE], extra = {}) => createCatalogue({ langs: LANGS, keys, ...extra });

const scopeFile = (catalogue, name) => path.join(catalogue.scopeDir, name);

function rewrite(file, from, to) {
	writeFileSync(file, readFileSync(file, 'utf8').replace(from, to));
}

const findings = (catalogue) => linesOf(findingsOf(catalogue));

const placesOf = (catalogue) =>
	findingsOf(catalogue).map(({ type, file, line, col }) => ({
		type,
		file: path.relative(catalogue.root, file),
		line,
		col,
	}));

const typesOf = (catalogue) =>
	findingsOf(catalogue).map(({ type, lang, file }) => ({
		type,
		lang,
		file: path.relative(catalogue.root, file),
	}));

const paramsOf = (body) => `export interface DemoI18nParams {\n${body}}\n`;

const declaring = (key, fields) =>
	paramsOf(`\t'${key}': {\n${fields.map((field) => `\t\t${field};\n`).join('')}\t};\n`);

describe('check — the files of a scope', () => {
	test('reports a language file that is not there', () => {
		const catalogue = catalogueWith();

		rmSync(scopeFile(catalogue, 'es-ES.json'));

		deepStrictEqual(findings(catalogue), ['error missing-lang-file [es-ES]: file not found']);
	});

	test('reports a language file that is not valid JSON', () => {
		const catalogue = catalogueWith();

		writeFileSync(scopeFile(catalogue, 'es-ES.json'), `{\n\t"${ULID}": "Guardar",\n}\n`);

		deepStrictEqual(typesOf(catalogue), [
			{ type: 'invalid-json', lang: 'es-ES', file: 'i18n/demo/es-ES.json' },
		]);
	});

	test('reports a scope without keys.ts, and checks nothing else in it', () => {
		const catalogue = catalogueWith();

		rmSync(scopeFile(catalogue, 'keys.ts'));

		deepStrictEqual(findings(catalogue), ['error missing-keys-file: keys.ts not found']);
	});

	test('reports keys.ts exporting its constant under another name, where it is declared', () => {
		const catalogue = catalogueWith();

		rewrite(scopeFile(catalogue, 'keys.ts'), 'DemoI18n', 'DemoKeys');

		deepStrictEqual(findings(catalogue), [
			'error bad-const-name: exports "DemoKeys", expected "DemoI18n"',
		]);
		deepStrictEqual(placesOf(catalogue), [
			{ type: 'bad-const-name', file: 'i18n/demo/keys.ts', line: 1, col: 14 },
		]);
	});
});

describe('check — the keys', () => {
	test('reports a value that is no ULID, and the translations it leaves behind', () => {
		const catalogue = catalogueWith();

		rewrite(scopeFile(catalogue, 'keys.ts'), `demo.${ULID}`, 'demo.not-a-ulid');

		deepStrictEqual(findings(catalogue), [
			'error invalid-ulid: SAVE = "demo.not-a-ulid"',
			'error missing-translation [en-GB]: SAVE (not-a-ulid) has no "en-GB" entry',
			`warning orphan-translation [en-GB]: ${ULID} is not declared`,
			`warning orphan-translation [es-ES]: ${ULID} is not declared`,
		]);
	});

	test('reports a ULID without the prefix of its scope', () => {
		const catalogue = catalogueWith();

		rewrite(scopeFile(catalogue, 'keys.ts'), `demo.${ULID}`, ULID);

		deepStrictEqual(findings(catalogue), [
			`error bad-scope-prefix: SAVE = "${ULID}", expected "demo.${ULID}"`,
		]);
	});

	test('reports the second key that reuses a ULID, naming the first', () => {
		const catalogue = catalogueWith([SAVE, { ...SAVE, name: 'STORE', ulid: ULID }]);

		deepStrictEqual(findings(catalogue), [
			'error duplicate-ulid: STORE reuses the ULID of demo.SAVE',
		]);
		deepStrictEqual(placesOf(catalogue)[0], {
			type: 'duplicate-ulid',
			file: 'i18n/demo/keys.ts',
			line: 3,
			col: 2,
		});
	});
});

describe('check — the translations', () => {
	test('reports a translation keys.ts does not declare, where it is written', () => {
		const catalogue = catalogueWith();

		rewrite(scopeFile(catalogue, 'es-ES.json'), '{', `{\n\t"${ulidOf(7)}": "Huérfano",`);

		deepStrictEqual(findings(catalogue), [
			`warning orphan-translation [es-ES]: ${ulidOf(7)} is not declared`,
		]);
		deepStrictEqual(placesOf(catalogue)[0], {
			type: 'orphan-translation',
			file: 'i18n/demo/es-ES.json',
			line: 2,
			col: 2,
		});
	});

	test('reports a key the source lacks too only in the source, pointing at keys.ts', () => {
		const catalogue = catalogueWith([SAVE, { name: 'GONE', texts: { 'en-GB': null, 'es-ES': null } }]);

		deepStrictEqual(findings(catalogue), [
			`error missing-translation [en-GB]: GONE (${ulidOf(1)}) has no "en-GB" entry`,
		]);
		deepStrictEqual(placesOf(catalogue)[0], {
			type: 'missing-translation',
			file: 'i18n/demo/keys.ts',
			line: 3,
			col: 2,
		});
	});

	test('reports a freshness state that is not valid JSON, and checks the params all the same', () => {
		const catalogue = catalogueWith([GREET]);

		writeFileSync(path.join(catalogue.i18nDir, 'state', 'demo.json'), '{ nope');

		deepStrictEqual(typesOf(catalogue), [
			{ type: 'invalid-json', lang: null, file: 'i18n/state/demo.json' },
		]);
	});
});

describe('check — params.ts', () => {
	const KEY = `demo.${ULID}`;

	test('wants no params.ts in a scope without params', () => {
		deepStrictEqual(findings(catalogueWith([SAVE])), []);
	});

	test('reports a params.ts that a scope with params lacks', () => {
		const catalogue = catalogueWith([GREET]);

		rmSync(scopeFile(catalogue, 'params.ts'));

		deepStrictEqual(findings(catalogue), [
			'error missing-params-file: params.ts not found, DemoI18nParams is not generated yet',
		]);
	});

	test('reports a param it declares that the source does not write, on its own line', () => {
		const catalogue = catalogueWith([GREET], {
			params: declaring(KEY, ['name: string', 'extra: string']),
		});

		deepStrictEqual(findings(catalogue), [
			`error stale-params: DemoI18nParams declares {extra} for GREET (${KEY}), absent from the default language`,
		]);
		deepStrictEqual(placesOf(catalogue)[0], {
			type: 'stale-params',
			file: 'i18n/demo/params.ts',
			line: 4,
			col: 3,
		});
	});

	test('reports a param the source writes that it does not declare, in the source', () => {
		const catalogue = catalogueWith([GREET], { params: declaring(KEY, ['other: string']) });

		deepStrictEqual(findings(catalogue), [
			`error stale-params: GREET (${KEY}) uses {name}, not declared in DemoI18nParams`,
			`error stale-params: DemoI18nParams declares {other} for GREET (${KEY}), absent from the default language`,
		]);
		deepStrictEqual(placesOf(catalogue)[0].file, 'i18n/demo/en-GB.json');
	});

	test('reports a type the ICU contradicts', () => {
		const catalogue = catalogueWith([COUNT], { params: declaring(KEY, ['count: string']) });

		deepStrictEqual(findings(catalogue), [
			`error stale-params: DemoI18nParams declares {count} as string for COUNT (${KEY}), ICU says number`,
		]);
	});

	test('accepts a string param narrowed by hand', () => {
		const catalogue = catalogueWith([GREET], { params: declaring(KEY, ["name: 'Ann' | 'Bob'"]) });

		deepStrictEqual(findings(catalogue), []);
	});

	test('reports a key it still declares after keys.ts dropped it', () => {
		const gone = `demo.${ulidOf(5)}`;
		const catalogue = catalogueWith([SAVE], { params: declaring(gone, ['name: string']) });

		deepStrictEqual(findings(catalogue), [`error stale-params: ${gone} is no longer declared`]);
	});

	test('asks for a regeneration when only the layout of the file is off', () => {
		const catalogue = catalogueWith([GREET], {
			params: `${declaring(KEY, ['name: string'])}\n`,
		});

		deepStrictEqual(findings(catalogue), ['error stale-params: DemoI18nParams needs regenerating']);
	});
});

describe('check — the barrel', () => {
	test('reports an index.ts that is not there', () => {
		const catalogue = catalogueWith();

		rmSync(path.join(catalogue.i18nDir, 'index.ts'));

		deepStrictEqual(findings(catalogue), ['error missing-barrel: index.ts not found']);
	});

	test('reports a scope and its params left out of the barrel', () => {
		const catalogue = catalogueWith([GREET]);

		writeFileSync(
			path.join(catalogue.i18nDir, 'index.ts'),
			'export const I18n = {} as const;\n\nexport type I18nParams = {};\n',
		);

		deepStrictEqual(findings(catalogue), [
			'error unregistered-scope: DemoI18n is never added to the I18n barrel',
			'error unregistered-params: DemoI18nParams is never added to the I18nParams union',
		]);
	});
});

describe('check — the context for translators', () => {
	test('reports a heading that matches no key, by name or by pattern', () => {
		const scope = [
			'# demo',
			'The demo.',
			'## SAVE',
			'Saves.',
			'## LOAD',
			'Loads.',
			'## SA*',
			'Every SA key.',
			'## X_*',
			'Nothing.',
			'',
		].join('\n\n');
		const catalogue = catalogueWith([SAVE], { context: { scope } });

		deepStrictEqual(findings(catalogue), [
			'warning unknown-context-key: "LOAD" matches no key of the "demo" scope',
			'warning unknown-context-key: "X_*" matches no key of the "demo" scope',
		]);
	});

	test('reports a glossary term without a translation, blank or absent, per language', () => {
		const glossary = {
			terms: [
				{ term: 'save', translations: { 'es-ES': 'guardar' } },
				{ term: 'load', translations: { 'es-ES': ' ' } },
				{ term: 'board' },
			],
		};

		deepStrictEqual(findings(catalogueWith([SAVE], { context: { glossary } })), [
			'warning glossary-term-missing-lang [es-ES]: "load" has no "es-ES" translation',
			'warning glossary-term-missing-lang [es-ES]: "board" has no "es-ES" translation',
		]);
	});

	test('reports a glossary that is not valid JSON', () => {
		const catalogue = catalogueWith();
		const dir = path.join(catalogue.i18nDir, 'context');

		mkdirSync(dir, { recursive: true });
		writeFileSync(path.join(dir, 'glossary.json'), '{ "terms": [ }');

		deepStrictEqual(typesOf(catalogue), [
			{ type: 'invalid-json', lang: null, file: 'i18n/context/glossary.json' },
		]);
	});

	test('has nothing to say about a context with no scope file and no glossary', () => {
		deepStrictEqual(findings(catalogueWith([SAVE], { context: { app: '# App\n\nA trainer.\n' } })), []);
	});
});
