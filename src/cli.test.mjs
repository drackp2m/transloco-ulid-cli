import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { after, describe, test } from 'node:test';

import { createCatalogue, removeCatalogues, ulidOf } from './testing/catalogue.mjs';
import { runCli } from './testing/cli.mjs';

const LANGS = ['en-GB', 'es-ES'];
const SAVE = { name: 'SAVE', texts: { 'en-GB': 'Save', 'es-ES': 'Guardar' }, seal: true };
const DELETE = { name: 'DELETE', texts: { 'en-GB': 'Delete', 'es-ES': '' } };
const PLURAL = '{count, plural, one {# challenge} other {# challenges}}';

after(removeCatalogues);

const project = (keys = [SAVE, DELETE]) => createCatalogue({ langs: LANGS, keys });

const read = (file) => readFileSync(file, 'utf8');

const spanishOf = (catalogue) => JSON.parse(read(path.join(catalogue.scopeDir, 'es-ES.json')));

const keysOf = (catalogue) => read(path.join(catalogue.scopeDir, 'keys.ts'));

const xliffOf = (catalogue) => path.join(catalogue.root, 'translations', 'es-ES.xlf');

function translate(catalogue, from, to) {
	const file = xliffOf(catalogue);

	writeFileSync(file, read(file).replace(from, to));
}

describe('transloco-ulid', () => {
	test('prints the commands and fails without one', () => {
		const { status, stderr } = runCli(project().root, []);

		strictEqual(status, 1);
		ok(stderr.includes('Usage: transloco-ulid <check|add|export|import|state|clear>'));
	});

	test('prints the help of check, add, export and import', () => {
		const { root } = project();

		for (const command of ['check', 'add', 'export', 'import']) {
			const { status, stdout } = runCli(root, [command, '--help']);

			strictEqual(status, 0);
			ok(stdout.startsWith(`Usage: transloco-ulid ${command}`), command);
		}
	});
});

describe('transloco-ulid check', () => {
	test('passes with warnings, and lists them only with --verbose', () => {
		const { root } = project();
		const quiet = runCli(root, ['check']);
		const verbose = runCli(root, ['check', '--verbose']);

		deepStrictEqual([quiet.status, verbose.status], [0, 0]);
		ok(quiet.stdout.includes('1 warning hidden — re-run with --verbose to list them'));
		ok(verbose.stdout.includes(`DELETE (${ulidOf(1)})  empty-translation`));
	});

	test('fails on an error, and says --fix can solve it', () => {
		const catalogue = project([SAVE, { ...DELETE, texts: { 'en-GB': 'Delete', 'es-ES': null } }]);
		const { status, stdout } = runCli(catalogue.root, ['check']);

		strictEqual(status, 1);
		ok(stdout.includes('has no "es-ES" entry  missing-translation'));
		ok(stdout.includes('1 problem potentially fixable with the --fix option.'));
	});

	test('fixes what it can with --fix, and then passes', () => {
		const catalogue = project([SAVE, { ...DELETE, texts: { 'en-GB': 'Delete', 'es-ES': null } }]);
		const { status, stdout } = runCli(catalogue.root, ['check', '--fix']);

		strictEqual(status, 0);
		ok(stdout.includes('✔ 1 file updated'));
		strictEqual(spanishOf(catalogue)[ulidOf(1)], '');
	});

	test('writes its report into the GitHub job summary', () => {
		const { root } = project();
		const summary = path.join(root, 'summary.md');

		writeFileSync(summary, '');
		runCli(root, ['check'], { GITHUB_STEP_SUMMARY: summary });

		const report = read(summary);

		ok(report.startsWith('## i18n Report'));
		ok(report.includes('| `empty-translation` | 0 | 1 |'));
	});
});

describe('transloco-ulid add', () => {
	test('adds a key and names its reference', () => {
		const catalogue = project();
		const { status, stdout } = runCli(catalogue.root, [
			'add',
			'--scope',
			'demo',
			'--name',
			'GREET',
			'--text',
			'Hello {name}',
		]);

		strictEqual(status, 0);
		ok(stdout.includes('✔ I18n.demo.GREET added'));
		ok(keysOf(catalogue).includes('\tGREET: '));
	});

	test('writes nothing with --dry-run', () => {
		const catalogue = project();
		const before = keysOf(catalogue);
		const { stdout } = runCli(catalogue.root, ['add', '--scope', 'demo', '--name', 'DRY', '--text', 'Dry', '--dry-run']);

		ok(stdout.includes('drop --dry-run to write.'));
		strictEqual(keysOf(catalogue), before);
	});

	test('refuses a name the scope already has', () => {
		const { status, stderr } = runCli(project().root, ['add', '--scope', 'demo', '--name', 'SAVE', '--text', 'Save']);

		strictEqual(status, 1);
		ok(stderr.includes('✖ demo.SAVE already exists'));
	});

	test('refuses a plural without every form the source language needs', () => {
		const { status, stderr } = runCli(project().root, [
			'add',
			'--scope',
			'demo',
			'--name',
			'CHALLENGES',
			'--plural',
			'count',
			'--one',
			'# challenge',
		]);

		strictEqual(status, 1);
		ok(stderr.includes('"en-GB" needs the forms one, other: missing other'));
	});

	test('refuses a form given without --plural, and a scope that does not exist', () => {
		const { root } = project();

		ok(runCli(root, ['add', '--scope', 'demo', '--name', 'X', '--one', 'x']).stderr.includes('--one goes only with --plural <param>'));
		ok(runCli(root, ['add', '--name', 'X', '--text', 'x']).stderr.includes('unknown scope "common" — the scopes are demo'));
	});

	test('warns about a form that names another param instead of counting', () => {
		const { stdout } = runCli(project().root, [
			'add',
			'--scope',
			'demo',
			'--name',
			'CHALLENGES',
			'--plural',
			'count',
			'--one',
			'{total} challenge',
			'--other',
			'{total} challenges',
		]);

		ok(stdout.includes('⚠ "one": {total} is not the plural param {count}: write # for the number'));
	});
});

describe('transloco-ulid export and import', () => {
	test('sends what is missing out, brings it back, and leaves it fresh', () => {
		const catalogue = project();
		const exported = runCli(catalogue.root, ['export', '--missing']);

		ok(exported.stdout.includes('translations/es-ES.xlf  1 unit · 1 untranslated'));
		translate(catalogue, '<target></target>', '<target>Borrar</target>');

		const dry = runCli(catalogue.root, ['import', '--dry-run']);

		ok(dry.stdout.includes('--dry-run: nothing was written.'));
		strictEqual(spanishOf(catalogue)[ulidOf(1)], '');

		strictEqual(runCli(catalogue.root, ['import']).status, 0);
		strictEqual(spanishOf(catalogue)[ulidOf(1)], 'Borrar');
		ok(runCli(catalogue.root, ['state']).stdout.includes('es-ES  2 fresh · 0 stale · 0 missing'));
		ok(runCli(catalogue.root, ['export', '--missing']).stdout.includes('Nothing to send for es-ES'));
	});

	test('writes its notes in English, or in the language notesLang names', () => {
		const keys = [{ name: 'CHALLENGES', texts: { 'en-GB': PLURAL, 'es-ES': '' } }];
		const english = createCatalogue({ langs: LANGS, keys });
		const spanish = createCatalogue({ langs: LANGS, keys, notesLang: 'es' });

		runCli(english.root, ['export']);
		runCli(spanish.root, ['export']);

		ok(read(xliffOf(english)).includes('<note category="examples">used for 1</note>'));
		ok(read(xliffOf(spanish)).includes('<note category="examples">se usa con 1</note>'));
	});

	test('refuses a notes language it has no texts for', () => {
		const catalogue = createCatalogue({ langs: LANGS, keys: [SAVE], notesLang: 'fr' });
		const { status, stderr } = runCli(catalogue.root, ['export']);

		strictEqual(status, 1);
		ok(stderr.includes('missing or invalid notesLang (one of en, es)'));
	});

	test('refuses a language the catalogue does not have', () => {
		const { status, stderr } = runCli(project().root, ['export', '--lang', 'fr-FR']);

		strictEqual(status, 1);
		ok(stderr.includes('unknown language(s): fr-FR'));
	});

	test('fails on an input that does not exist', () => {
		const { status, stderr } = runCli(project().root, ['import', 'nowhere']);

		strictEqual(status, 1);
		ok(stderr.includes('nowhere does not exist'));
	});

	test('skips the new keys of a file without a terminal to ask in, and adds them with --all-new', () => {
		const catalogue = project();

		runCli(catalogue.root, ['export']);
		translate(catalogue, `demo.${ulidOf(1)}`, `demo.${ulidOf(900)}`);
		translate(catalogue, '<target></target>', '<target>Nuevo</target>');

		ok(runCli(catalogue.root, ['import']).stdout.includes('1 new key skipped — pass --all-new to add them.'));
		ok(!keysOf(catalogue).includes(ulidOf(900)));

		const added = runCli(catalogue.root, ['import', '--all-new']);

		ok(added.stdout.includes('New keys landed in keys.ts'));
		ok(keysOf(catalogue).includes(`\tDELETE_2: 'demo.${ulidOf(900)}',`));
		ok(existsSync(xliffOf(catalogue)));
	});
});

describe('transloco-ulid state', () => {
	test('counts each status per language', () => {
		ok(runCli(project().root, ['state']).stdout.includes('es-ES  1 fresh · 0 stale · 1 missing'));
	});

	test('seals every translation as it is today with --adopt, the stale ones included', () => {
		const catalogue = project([
			{ name: 'SAVE', texts: { 'en-GB': 'Save', 'es-ES': 'Guardar' } },
			{ name: 'GREET', texts: { 'en-GB': 'Hello', 'es-ES': 'Hola' }, seal: 'Hi' },
		]);

		ok(runCli(catalogue.root, ['state']).stdout.includes('es-ES  0 fresh · 1 stale · 0 missing · 1 unknown'));

		const adopted = runCli(catalogue.root, ['state', '--adopt']);

		ok(adopted.stdout.includes('⚠ 1 outdated translation sealed as fresh'));
		ok(runCli(catalogue.root, ['state']).stdout.includes('es-ES  2 fresh · 0 stale · 0 missing'));
	});
});

describe('transloco-ulid clear', () => {
	test('refuses the source language, and a call that names none', () => {
		const { root } = project();
		const source = runCli(root, ['clear', '--lang', 'en-GB']);
		const none = runCli(root, ['clear']);

		deepStrictEqual([source.status, none.status], [1, 1]);
		ok(source.stderr.includes('en-GB is the source language'));
		ok(none.stderr.includes('nothing to clear'));
	});

	test('lists what it would clear with --dry-run, and writes nothing', () => {
		const catalogue = project();
		const { stdout } = runCli(catalogue.root, ['clear', '--lang', 'es-ES', '--dry-run']);

		ok(stdout.includes('es-ES  demo · 1 cleared'));
		strictEqual(spanishOf(catalogue)[ulidOf(0)], 'Guardar');
	});

	test('empties a language, and drops its seals with --unseal', () => {
		const catalogue = project();

		strictEqual(runCli(catalogue.root, ['clear', '--lang', 'es-ES', '--unseal']).status, 0);
		deepStrictEqual(spanishOf(catalogue), { [ulidOf(0)]: '', [ulidOf(1)]: '' });
		deepStrictEqual(JSON.parse(read(path.join(catalogue.i18nDir, 'state', 'demo.json'))), {});
	});
});
