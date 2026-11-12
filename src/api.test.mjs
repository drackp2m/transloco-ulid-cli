import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { after, describe, test } from 'node:test';

import * as api from './api.mjs';
import { createCatalogue, removeCatalogues, ulidOf } from './testing/catalogue.mjs';

after(removeCatalogues);

const LANGS = ['es-ES', 'en-GB'];
const SAVE = { name: 'SAVE', texts: { 'es-ES': 'Guardar', 'en-GB': 'Save' }, seal: true };
const GREET = { name: 'GREET', texts: { 'es-ES': 'Hola {name}', 'en-GB': '' } };

const MANIFEST = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

function projectOf(keys = [SAVE, GREET], extra = {}) {
	const catalogue = createCatalogue({ langs: LANGS, keys, ...extra });

	return { catalogue, project: api.loadProject(catalogue.root) };
}

const fileOf = (catalogue, name) => path.join(catalogue.scopeDir, name);

const typesOf = (analysis) => analysis.findings.map(({ type }) => type);

describe('the public API', () => {
	test('exports exactly this, so a change to it is a decision and not an accident', () => {
		deepStrictEqual(Object.keys(api).sort(), [
			'API_VERSION',
			'CLI_VERSION',
			'CONFIG_FILE',
			'DEFAULT_OUT_DIR',
			'GROUPS',
			'PARAMS_LEFT',
			'RULES',
			'RULE_TYPES',
			'SEVERITIES',
			'STATUSES',
			'analyse',
			'applyImport',
			'buildExport',
			'checkText',
			'exportLangs',
			'formDoubt',
			'formProblem',
			'formsToAsk',
			'groupOf',
			'isFixable',
			'isRule',
			'isUlid',
			'keyNameProblem',
			'loadProject',
			'paramNameProblem',
			'planImport',
			'planKey',
			'pluralSource',
			'readLanguages',
			'readXliff',
			'representativeOf',
			'ruleOf',
			'severityOf',
			'tallyOf',
			'textProblems',
			'toKebabCase',
			'toPascalCase',
			'typesOf',
			'usagesIn',
			'writeExport',
		]);
	});

	test('says which contract it speaks and which package it is', () => {
		strictEqual(api.API_VERSION, 1);
		strictEqual(api.CLI_VERSION, MANIFEST.version);
	});

	test('is what the package resolves to by its bare name', () => {
		strictEqual(MANIFEST.exports['.'], './src/api.mjs');
	});
});

describe('loadProject', () => {
	test('reads the configuration with every path absolute, from anywhere under the root', () => {
		const { catalogue } = projectOf();
		const project = api.loadProject(catalogue.sourceDir);

		strictEqual(project.root, catalogue.root);
		strictEqual(project.configFile, path.join(catalogue.root, 'i18n.config.json'));
		strictEqual(project.i18nDir, catalogue.i18nDir);
		deepStrictEqual(project.sourceDirs, [catalogue.sourceDir]);
		deepStrictEqual(project.langs, LANGS);
		strictEqual(project.defaultLang, 'es-ES');
		strictEqual(project.pipe, 'i18n');
	});
});

describe('analyse', () => {
	test('reads the scopes, the usages, the findings and the freshness in one pass', () => {
		const { project } = projectOf();
		const analysis = api.analyse(project);

		deepStrictEqual(
			analysis.scopes.map(({ name }) => name),
			['demo'],
		);
		deepStrictEqual([...analysis.sources.usages.keys()], ['demo:SAVE', 'demo:GREET']);
		deepStrictEqual(typesOf(analysis), ['empty-translation']);
		deepStrictEqual(analysis.freshness, [
			{ scope: 'demo', ulid: ulidOf(0), name: 'SAVE', lang: 'en-GB', status: 'fresh' },
			{ scope: 'demo', ulid: ulidOf(1), name: 'GREET', lang: 'en-GB', status: 'missing' },
		]);
		deepStrictEqual(
			[...analysis.tally],
			[['en-GB', { fresh: 1, stale: 0, missing: 1, unknown: 0 }]],
		);
	});

	test('hands each finding over with its key and what the registry says of its rule', () => {
		const { catalogue, project } = projectOf();
		const [finding] = api.analyse(project).findings;

		deepStrictEqual(finding, {
			type: 'empty-translation',
			scope: 'demo',
			file: fileOf(catalogue, 'en-GB.json'),
			message: `GREET (${ulidOf(1)})`,
			line: 3,
			col: 2,
			lang: 'en-GB',
			column: null,
			key: 'GREET',
			ulid: ulidOf(1),
			group: 'pending',
			severity: 'warning',
			fixable: false,
			meaning: 'The entry is there and empty: waiting for the translator.',
		});
	});

	test('lists the params each key declares, by the value of the key', () => {
		const { project } = projectOf();

		deepStrictEqual(
			[...api.analyse(project).params].map(([key, fields]) => [key, [...fields]]),
			[[`demo.${ulidOf(1)}`, [['name', 'string']]]],
		);
	});
});

describe('analyse over what an editor has not saved', () => {
	test('judges a translation by its unsaved text, and leaves the disk alone', () => {
		const { catalogue, project } = projectOf();
		const file = fileOf(catalogue, 'en-GB.json');
		const unsaved = readFileSync(file, 'utf8').replace('""', '"Hello {nam}"');
		const analysis = api.analyse(project, { texts: new Map([[file, unsaved]]) });

		deepStrictEqual(typesOf(analysis), ['param-mismatch', 'param-mismatch']);
		deepStrictEqual(typesOf(api.analyse(project)), ['empty-translation']);
	});

	test('reads a half-typed file as the JSON error it is', () => {
		const { catalogue, project } = projectOf();
		const texts = new Map([[fileOf(catalogue, 'en-GB.json'), '{ "']]);

		deepStrictEqual(typesOf(api.analyse(project, { texts })), ['invalid-json']);
	});

	test('judges the sources by their unsaved text too', () => {
		const { catalogue, project } = projectOf([SAVE]);
		const file = path.join(catalogue.sourceDir, 'page.html');
		const html = '<p>{{ I18n.demo.SAVE }}</p>\n<p>{{ I18n.demo.GONE | i18n }}</p>\n';
		const texts = new Map([[file, html]]);
		const found = api.analyse(project, { texts }).findings;

		deepStrictEqual(
			found.map(({ type, line, col }) => ({ type, line, col })),
			[
				{ type: 'missing-pipe', line: 1, col: 7 },
				{ type: 'unknown-key', line: 2, col: 7 },
			],
		);
	});

	test('sees a key the unsaved keys.ts has just declared', () => {
		const { catalogue, project } = projectOf([SAVE]);
		const file = fileOf(catalogue, 'keys.ts');
		const added = `\tLOAD: 'demo.${ulidOf(7)}',\n} as const;`;
		const texts = new Map([[file, readFileSync(file, 'utf8').replace('} as const;', added)]]);

		deepStrictEqual(typesOf(api.analyse(project, { texts })), [
			'missing-translation',
			'unused-key',
		]);
	});
});

describe('analyse without reading everything again', () => {
	test('takes the sources of an earlier pass instead of walking them', () => {
		const { catalogue, project } = projectOf([SAVE]);
		const first = api.analyse(project);
		const page = path.join(catalogue.sourceDir, 'page.html');
		const texts = new Map([[page, '']]);

		deepStrictEqual(typesOf(api.analyse(project, { texts })), ['unused-key']);
		deepStrictEqual(typesOf(api.analyse(project, { texts, sources: first.sources })), []);
	});

	test('takes the scopes of an earlier pass as they are', () => {
		const { project } = projectOf();
		const first = api.analyse(project);

		strictEqual(api.analyse(project, { scopes: first.scopes }).scopes, first.scopes);
	});
});

describe('checkText', () => {
	const STRAY = '{count, plural, one {{total} reto} other {# retos}}';

	test('judges a translation on its own, each problem with its rule', () => {
		const [problem, ...rest] = api.checkText('{count, plural, one {a}}', 'en-GB');

		deepStrictEqual(rest, []);
		strictEqual(problem.type, 'missing-other');
		strictEqual(problem.severity, 'error');
		strictEqual(problem.group, 'message');
	});

	test('asks the source for what only the source answers for', () => {
		const asSource = api.checkText(STRAY, 'es-ES', { langs: ['es-ES', 'ru-RU'], source: true });

		deepStrictEqual(
			asSource.map(({ type, severity }) => ({ type, severity })),
			[{ type: 'stray-plural-param', severity: 'warning' }],
		);
		deepStrictEqual(api.checkText(STRAY, 'es-ES'), []);
	});

	test('measures the source in every language it will be translated into', () => {
		const three =
			'{a, plural, one {x} other {y}} {b, plural, one {x} other {y}} ' +
			'{c, plural, one {x} other {y}}';
		const wide = api.checkText(three, 'es-ES', { langs: ['es-ES', 'ru-RU'], source: true });

		deepStrictEqual(
			wide.map(({ type }) => type),
			['too-many-forms'],
		);
		ok(wide[0].message.includes('64 forms in "ru-RU"'));
		deepStrictEqual(api.checkText(three, 'es-ES'), []);
	});
});
