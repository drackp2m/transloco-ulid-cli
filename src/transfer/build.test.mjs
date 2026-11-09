import { deepStrictEqual, ok, strictEqual, throws } from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { collectUsages } from '../catalogue/collect.mjs';
import { readContext } from '../catalogue/context.mjs';
import { hashOf } from '../catalogue/freshness.mjs';
import {
	XLIFF_PREFIX,
	createCatalogue,
	removeCatalogues,
	scopesOf,
	ulidOf,
} from '../testing/catalogue.mjs';

import { buildExport, exportLangs } from './build.mjs';
import { readXliff } from './xliff.mjs';

const LANGS = ['en-GB', 'es-ES', 'ru-RU'];
const PLURAL = '{count, plural, one {# challenge} other {# challenges}}';
const KEYS = [
	{
		name: 'SAVE',
		texts: { 'en-GB': 'Save the training', 'es-ES': 'Guardar el entrenamiento', 'ru-RU': 'Сохранить' },
		seal: true,
	},
	{
		name: 'GREET',
		texts: { 'en-GB': 'Hello {name}', 'es-ES': 'Hola {name}', 'ru-RU': '' },
		seal: 'Hi {name}',
	},
	{ name: 'CHALLENGES', texts: { 'en-GB': PLURAL, 'es-ES': '', 'ru-RU': '' } },
];
const CONTEXT = {
	app: '# App\n\nA chess trainer.\n\n## es-ES\n\nSpanish from Spain.\n',
	scope: '# demo\n\nThe demo screen.\n\n## SAVE\n\nThe button that saves.\n\n## GREET*\n\nA greeting.\n',
	glossary: {
		terms: [{ term: 'training', note: 'the programme', translations: { 'es-ES': 'entrenamiento' } }],
		keep: ['FEN'],
	},
};

let catalogue;
let base;

before(() => {
	catalogue = createCatalogue({ langs: LANGS, keys: KEYS, context: CONTEXT });
	base = {
		scopes: scopesOf(catalogue),
		defaultLang: 'en-GB',
		usages: collectUsages([catalogue.sourceDir]).usages,
		root: catalogue.root,
		context: readContext(catalogue),
		i18nDir: catalogue.i18nDir,
		xliffPrefix: XLIFF_PREFIX,
	};
});

after(removeCatalogues);

const exported = (lang, filter = 'all', extra = {}) => buildExport({ ...base, lang, filter, ...extra });

const fileOf = (lang, filter, extra) => readXliff(exported(lang, filter, extra).content).files[0];

const idOf = (index, suffix = '') => `demo.${ulidOf(index)}${suffix}`;

const unitOf = (lang, id) => fileOf(lang).units.find((unit) => unit.id === id);

const notesOf = (unit) => Object.fromEntries(unit.notes.map((note) => [note.category, note.text]));

describe('buildExport — units', () => {
	test('gives each key a unit whose id is the key, and a plural one unit per form', () => {
		deepStrictEqual(
			fileOf('es-ES').units.map((unit) => unit.id),
			[idOf(0), idOf(1), idOf(2, '#plural:one'), idOf(2, '#plural:other')],
		);
	});

	test('names the scope and the file the translation goes back to', () => {
		const file = fileOf('es-ES');

		deepStrictEqual([file.id, file.original], ['demo', 'i18n/demo/es-ES.json']);
	});

	test('carries the source and the current target', () => {
		const unit = unitOf('es-ES', idOf(0));

		deepStrictEqual([unit.source, unit.target, unit.state], [
			'Save the training',
			'Guardar el entrenamiento',
			'translated',
		]);
	});

	test('fans a plural out into the forms the target language needs, not those of the source', () => {
		const ids = fileOf('ru-RU', 'missing').units.map((unit) => unit.id);

		deepStrictEqual(ids.slice(1), [
			idOf(2, '#plural:one'),
			idOf(2, '#plural:few'),
			idOf(2, '#plural:many'),
			idOf(2, '#plural:other'),
		]);
	});

	test('gives a form the source does not have the source text of "other"', () => {
		const few = fileOf('ru-RU', 'missing').units.find((unit) => unit.id === idOf(2, '#plural:few'));

		strictEqual(few.source, '# challenges');
	});
});

describe('buildExport — notes', () => {
	test('sends the app, the language, the scope and the glossary once per file', () => {
		const notes = notesOf(fileOf('es-ES'));

		deepStrictEqual(Object.keys(notes), ['app', 'language', 'scope', 'glossary', 'subStatePrefix']);
		deepStrictEqual([notes.app, notes.language, notes.scope, notes.subStatePrefix], [
			'A chess trainer.',
			'Spanish from Spain.',
			'The demo screen.',
			XLIFF_PREFIX,
		]);
		ok(notes.glossary.startsWith('training → entrenamiento — the programme'));
		ok(notes.glossary.includes('FEN'));
	});

	test('leaves out the language section of another language', () => {
		strictEqual(notesOf(fileOf('ru-RU')).language, undefined);
	});

	test('tells the translator the constant, where it is used, what it means and its terms', () => {
		deepStrictEqual(notesOf(unitOf('es-ES', idOf(0))), {
			key: 'DemoI18n.SAVE',
			usage: 'src/page.html',
			context: 'The button that saves.',
			term: 'training → entrenamiento',
			srcHash: hashOf('Save the training'),
		});
	});

	test('types each param, and takes the context of a group pattern', () => {
		const notes = notesOf(unitOf('es-ES', idOf(1)));

		deepStrictEqual([notes.param, notes.context], ['{name}: string', 'A greeting.']);
	});

	test('tells a plural form which one it is, which numbers select it, and its siblings', () => {
		const few = fileOf('ru-RU', 'missing').units.find((unit) => unit.id === idOf(2, '#plural:few'));
		const notes = notesOf(few);

		strictEqual(notes.category, 'plural:few');
		ok(notes.examples.includes('2, 3, 4'));
		strictEqual(notes.siblings, 'en-GB · one: «# challenge» · other: «# challenges»');
	});
});

describe('buildExport — what travels', () => {
	const ids = (lang, filter, extra) => fileOf(lang, filter, extra)?.units.map((unit) => unit.id) ?? [];

	test('sends only the untranslated with missing, the stale with stale, both with pending', () => {
		deepStrictEqual(ids('es-ES', 'missing'), [idOf(2, '#plural:one'), idOf(2, '#plural:other')]);
		deepStrictEqual(ids('es-ES', 'stale'), [idOf(1)]);
		deepStrictEqual(ids('es-ES', 'pending'), [
			idOf(1),
			idOf(2, '#plural:one'),
			idOf(2, '#plural:other'),
		]);
	});

	test('counts what it sends', () => {
		const { total, untranslated, outdated } = exported('es-ES');

		deepStrictEqual({ total, untranslated, outdated }, { total: 4, untranslated: 2, outdated: 1 });
	});

	test('marks a stale unit as outdated and sends its old target along', () => {
		const unit = fileOf('es-ES', 'stale').units[0];

		deepStrictEqual([unit.target, unit.state, unit.subState], ['Hola {name}', 'initial', 'test:outdated']);
		strictEqual(unit.notes[0].category, 'outdated');
	});

	test('sends a blank file with no target and no outdated note', () => {
		const unit = fileOf('es-ES', 'stale', { blank: true }).units[0];

		deepStrictEqual([unit.target, unit.subState], ['', null]);
		strictEqual(notesOf(unit).outdated, undefined);
	});

	test('leaves out a scope with nothing to send, and the scopes not asked for', () => {
		strictEqual(exported('ru-RU', 'stale').files.length, 0);
		strictEqual(exported('es-ES', 'all', { only: ['other'] }).total, 0);
	});
});

describe('exportLangs', () => {
	const options = { langs: LANGS, defaultLang: 'en-GB' };

	test('targets every language but the source by default', () => {
		deepStrictEqual(exportLangs(options, []), ['es-ES', 'ru-RU']);
	});

	test('never targets the source, even when asked', () => {
		deepStrictEqual(exportLangs(options, ['ru-RU', 'en-GB']), ['ru-RU']);
	});

	test('refuses a language the catalogue does not have', () => {
		throws(() => exportLangs(options, ['fr-FR']), /unknown language\(s\): fr-FR/);
	});
});
