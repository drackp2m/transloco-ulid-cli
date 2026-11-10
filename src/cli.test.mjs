import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { after, describe, test } from 'node:test';

import { NOTE_TEXTS } from './catalogue/note-texts.mjs';
import { SPANISH_NOTES, createCatalogue, removeCatalogues, ulidOf } from './testing/catalogue.mjs';
import { runCli } from './testing/cli.mjs';

const LANGS = ['en-GB', 'es-ES'];
const SAVE = { name: 'SAVE', texts: { 'en-GB': 'Save', 'es-ES': 'Guardar' }, seal: true };
const DELETE = { name: 'DELETE', texts: { 'en-GB': 'Delete', 'es-ES': '' } };
const PLURAL = '{count, plural, one {# challenge} other {# challenges}}';
const STALE = { name: 'GREET', texts: { 'en-GB': 'Hello {name}', 'es-ES': 'Hola {name}' }, seal: 'Hi {name}' };
const COMMENTED = { name: 'KEY', texts: { 'en-GB': 'Key', 'es-ES': 'Clave' }, seal: true, used: false };
const IN_A_COMMENT = '<!-- {{ I18n.demo.KEY | i18n }} -->';

after(removeCatalogues);

const project = (keys = [SAVE, DELETE]) => createCatalogue({ langs: LANGS, keys });

const read = (file) => readFileSync(file, 'utf8');

const spanishOf = (catalogue) => JSON.parse(read(path.join(catalogue.scopeDir, 'es-ES.json')));

const keysOf = (catalogue) => read(path.join(catalogue.scopeDir, 'keys.ts'));

const xliffOf = (catalogue) => path.join(catalogue.root, 'translations', 'es-ES.xlf');

function withoutScopes() {
	const catalogue = project([SAVE]);

	rmSync(catalogue.scopeDir, { recursive: true });

	return catalogue;
}

function translate(catalogue, from, to) {
	const file = xliffOf(catalogue);

	writeFileSync(file, read(file).replace(from, to));
}

describe('transloco-ulid', () => {
	test('prints the commands and fails without one', () => {
		const { status, stderr } = runCli(project().root, []);

		strictEqual(status, 1);
		ok(stderr.includes('Usage: transloco-ulid <check|add|export|import|state|clear|notes>'));
	});

	test('prints the help of check, add, export, import and notes', () => {
		const { root } = project();

		for (const command of ['check', 'add', 'export', 'import', 'notes']) {
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

	test('says so when every key is fine, and that --fix had nothing to write', () => {
		const { root } = project([SAVE]);

		ok(runCli(root, ['check']).stdout.includes('✔ Every key is declared, translated and used.'));
		ok(runCli(root, ['check', '--fix']).stdout.includes('✓ Nothing to write'));
	});

	test('counts the notes as hidden, and prints them with --verbose', () => {
		const catalogue = createCatalogue({ langs: LANGS, keys: [SAVE, COMMENTED], usages: IN_A_COMMENT });
		const quiet = runCli(catalogue.root, ['check']);
		const verbose = runCli(catalogue.root, ['check', '--verbose']);

		deepStrictEqual([quiet.status, verbose.status], [0, 0]);
		ok(quiet.stdout.includes('1 note hidden — re-run with --verbose to list them'));
		ok(verbose.stdout.includes('━━ Info ━━'));
		ok(verbose.stdout.includes('3:2  info  KEY is only referenced from a comment  commented-usage'));
		ok(verbose.stdout.includes('ℹ 1 note'));
	});

	test('skips a catalogue without scopes, in the log and in the job summary', () => {
		const { root } = withoutScopes();
		const summary = path.join(root, 'summary.md');

		writeFileSync(summary, '');

		const { status, stdout } = runCli(root, ['check'], { GITHUB_STEP_SUMMARY: summary });

		strictEqual(status, 0);
		ok(stdout.includes('⊘ skipped — no scopes in i18n'));
		ok(read(summary).includes('> ⊘ Skipped — no scopes in `i18n`.'));
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

	test('gives the job summary the verdict on errors, what --fix can do and the notes', () => {
		const missing = { ...COMMENTED, texts: { 'en-GB': 'Key', 'es-ES': null } };
		const catalogue = createCatalogue({
			langs: LANGS,
			keys: [SAVE, DELETE, missing],
			usages: IN_A_COMMENT,
		});
		const summary = path.join(catalogue.root, 'summary.md');

		writeFileSync(summary, '');

		strictEqual(runCli(catalogue.root, ['check'], { GITHUB_STEP_SUMMARY: summary }).status, 1);

		const report = read(summary);

		ok(report.includes('| `missing-translation` | 1 | 0 |\n| `empty-translation` | 0 | 1 |'));
		ok(report.includes('> ❌ 1 error · 1 warning.'));
		ok(report.includes('_1 problem potentially fixable with the `--fix` option._'));
		ok(report.includes('_1 note printed in the step log._'));
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

	test('asks for a name, and for either --text or --plural', () => {
		const { root } = project();
		const nameless = runCli(root, ['add', '--scope', 'demo', '--text', 'x']);
		const both = runCli(root, ['add', '--scope', 'demo', '--name', 'X', '--text', 'x', '--plural', 'count']);

		deepStrictEqual([nameless.status, both.status], [1, 1]);
		ok(nameless.stderr.includes('✖ name the key with --name <NAME>'));
		ok(both.stderr.includes('✖ give --text or --plural, not both'));
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

	test('writes its notes in English, or with the notes file of the language notesLang names', () => {
		const keys = [{ name: 'CHALLENGES', texts: { 'en-GB': PLURAL, 'es-ES': '' } }];
		const english = createCatalogue({ langs: LANGS, keys });
		const spanish = createCatalogue({
			langs: LANGS,
			keys,
			notesLang: 'es',
			context: { notes: { es: SPANISH_NOTES } },
		});

		runCli(english.root, ['export']);
		runCli(spanish.root, ['export']);

		ok(read(xliffOf(english)).includes('<note category="examples">the app shows this form when the number is 1</note>'));
		ok(read(xliffOf(spanish)).includes('<note category="examples">se usa con 1</note>'));
	});

	test('refuses to export, and fails the check, without the notes file of its notes language', () => {
		const catalogue = createCatalogue({ langs: LANGS, keys: [SAVE], notesLang: 'fr' });
		const exported = runCli(catalogue.root, ['export']);
		const checked = runCli(catalogue.root, ['check']);

		deepStrictEqual([exported.status, checked.status], [1, 1]);
		ok(exported.stderr.includes('✖ i18n/context/notes.fr.json: notesLang is "fr" and there is no such file'));
		ok(checked.stdout.includes('missing-notes-file'));
		ok(!existsSync(xliffOf(catalogue)));
	});

	test('refuses a notesLang that is not a language tag', () => {
		const catalogue = createCatalogue({ langs: LANGS, keys: [SAVE], notesLang: 'Spanish' });
		const { status, stderr } = runCli(catalogue.root, ['export']);

		strictEqual(status, 1);
		ok(stderr.includes('missing or invalid notesLang (a language tag such as "es" or "pt-BR")'));
	});

	test('sends only the outdated with --stale, and both kinds with --pending', () => {
		const { root } = project([SAVE, DELETE, STALE]);

		ok(runCli(root, ['export', '--stale']).stdout.includes('es-ES.xlf  1 unit · 1 outdated'));
		ok(
			runCli(root, ['export', '--pending']).stdout.includes(
				'es-ES.xlf  2 units · 1 untranslated · 1 outdated',
			),
		);
	});

	test('says the targets go out empty with --blank', () => {
		const catalogue = project([SAVE, STALE]);
		const { stdout } = runCli(catalogue.root, ['export', '--blank']);

		ok(stdout.includes('Targets go out empty — no existing translation travels with the file.'));
		ok(!read(xliffOf(catalogue)).includes('<target>Hola'));
	});

	test('fails without scopes, and without a language to translate into', () => {
		const single = createCatalogue({ langs: ['en-GB'], keys: [{ name: 'SAVE', texts: { 'en-GB': 'Save' } }] });
		const scopeless = runCli(withoutScopes().root, ['export']);
		const sourceOnly = runCli(single.root, ['export']);

		deepStrictEqual([scopeless.status, sourceOnly.status], [1, 1]);
		ok(scopeless.stderr.includes('✖ no scopes in i18n'));
		ok(sourceOnly.stderr.includes('✖ nothing to export — every language is the source one'));
	});

	test('refuses a language the catalogue does not have', () => {
		const { status, stderr } = runCli(project().root, ['export', '--lang', 'fr-FR']);

		strictEqual(status, 1);
		ok(stderr.includes('unknown language(s): fr-FR'));
	});

	test('lists what changed and what stays outdated only with --verbose', () => {
		const catalogue = project([SAVE, DELETE, STALE]);

		runCli(catalogue.root, ['export']);
		translate(catalogue, '<target>Guardar</target>', '<target>Salvar</target>');

		const quiet = runCli(catalogue.root, ['import', 'translations/es-ES.xlf', '--dry-run']);
		const verbose = runCli(catalogue.root, ['import', '--verbose', '--dry-run']);

		ok(quiet.stdout.includes('es-ES  1 updated · 1 unchanged · 1 empty'));
		ok(quiet.stdout.includes('1 translation changed — re-run with --verbose to list them'));
		ok(quiet.stdout.includes('⚠ 1 key came back without a fresh translation — left outdated'));
		ok(verbose.stdout.includes('demo.SAVE · es-ES\n    - Guardar\n    + Salvar'));
		ok(verbose.stdout.includes('left outdated\n      demo.GREET · es-ES'));
	});

	test('lists the problems of what it imported', () => {
		const catalogue = project([{ name: 'GREET', texts: { 'en-GB': 'Hello {name}', 'es-ES': '' } }]);

		runCli(catalogue.root, ['export']);
		translate(catalogue, '<target></target>', '<target>Hola</target>');

		const { status, stdout } = runCli(catalogue.root, ['import']);

		strictEqual(status, 0);
		ok(stdout.includes(`✖ demo.${ulidOf(0)}  placeholders differ from en-GB`));
		ok(stdout.includes('1 problem'));
	});

	test('fails on a directory without XLIFF files', () => {
		const { root } = project();

		mkdirSync(path.join(root, 'empty'));

		const { status, stderr } = runCli(root, ['import', 'empty']);

		strictEqual(status, 1);
		ok(stderr.includes('✖ no .xlf files in empty'));
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

	test('fails without scopes, and on a state file that is not valid JSON', () => {
		const broken = project();

		writeFileSync(path.join(broken.i18nDir, 'state', 'demo.json'), '{ nope');

		const scopeless = runCli(withoutScopes().root, ['state']);
		const invalid = runCli(broken.root, ['state']);

		deepStrictEqual([scopeless.status, invalid.status], [1, 1]);
		ok(scopeless.stderr.includes('✖ no scopes in i18n'));
		ok(invalid.stderr.includes('✖ i18n/state/demo.json: '));
	});

	test('has nothing to write with --adopt when every seal is current', () => {
		ok(runCli(project([SAVE]).root, ['state', '--adopt']).stdout.includes('✓ Nothing to write'));
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

	test('refuses a language or a scope the catalogue does not have, and an empty catalogue', () => {
		const { root } = project();
		const lang = runCli(root, ['clear', '--lang', 'fr-FR']);
		const scope = runCli(root, ['clear', '--lang', 'es-ES', '--scope', 'other']);
		const scopeless = runCli(withoutScopes().root, ['clear', '--lang', 'es-ES']);

		deepStrictEqual([lang.status, scope.status, scopeless.status], [1, 1, 1]);
		ok(lang.stderr.includes('✖ unknown language(s): fr-FR'));
		ok(scope.stderr.includes('✖ unknown scope(s): other'));
		ok(scopeless.stderr.includes('✖ no scopes in i18n'));
	});

	test('has nothing to clear in a language that is already empty', () => {
		const { stdout } = runCli(project([DELETE]).root, ['clear', '--lang', 'es-ES']);

		ok(stdout.includes('✓ Nothing to clear — every target is already empty'));
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

describe('transloco-ulid notes', () => {
	const notesIn = (catalogue, lang) =>
		path.join(catalogue.i18nDir, 'context', `notes.${lang}.json`);

	const french = () => createCatalogue({ langs: LANGS, keys: [SAVE], notesLang: 'fr' });

	test('writes the notes file of notesLang from the template, which check then wants translated', () => {
		const catalogue = french();
		const dry = runCli(catalogue.root, ['notes', '--dry-run']);

		ok(dry.stdout.includes('i18n/context/notes.fr.json  11 texts from the English template'));
		ok(!existsSync(notesIn(catalogue, 'fr')));

		const { status, stdout } = runCli(catalogue.root, ['notes']);

		strictEqual(status, 0);
		ok(stdout.includes('✔ notes.fr.json written'));
		deepStrictEqual(JSON.parse(read(notesIn(catalogue, 'fr'))), NOTE_TEXTS);

		const checked = runCli(catalogue.root, ['check', '--verbose']);

		strictEqual(checked.status, 0);
		ok(checked.stdout.includes('nothing translated yet: every text is still the English template'));
		ok(
			runCli(catalogue.root, ['export']).stdout.includes(
				'⚠ i18n/context/notes.fr.json: nothing translated yet',
			),
		);
	});

	test('adds only what the file lacks, and then has nothing to add', () => {
		const catalogue = french();
		const texts = { ...SPANISH_NOTES };

		delete texts.outdated;
		mkdirSync(path.dirname(notesIn(catalogue, 'fr')), { recursive: true });
		writeFileSync(notesIn(catalogue, 'fr'), JSON.stringify(texts));

		ok(runCli(catalogue.root, ['notes']).stdout.includes('1 text added in English: "outdated"'));
		deepStrictEqual(JSON.parse(read(notesIn(catalogue, 'fr'))), {
			...SPANISH_NOTES,
			outdated: NOTE_TEXTS.outdated,
		});
		ok(runCli(catalogue.root, ['notes']).stdout.includes('already has every text of the template'));
	});

	test('writes another language with --lang, and says how to use it', () => {
		const catalogue = french();
		const { stdout } = runCli(catalogue.root, ['notes', '--lang', 'de']);

		ok(existsSync(notesIn(catalogue, 'de')));
		ok(stdout.includes('Set "notesLang": "de" in i18n.config.json to use it.'));
	});

	test('offers the English file as a way to reword the template', () => {
		const { stdout } = runCli(project().root, ['notes']);

		ok(stdout.includes('✔ notes.en.json written'));
		ok(stdout.includes('Reword what you like, and keep each {placeholder}.'));
		ok(!stdout.includes('Set "notesLang"'));
	});

	test('refuses a language that is not a tag, and a file that does not parse', () => {
		const catalogue = french();

		mkdirSync(path.dirname(notesIn(catalogue, 'fr')), { recursive: true });
		writeFileSync(notesIn(catalogue, 'fr'), '{ nope');

		const tag = runCli(catalogue.root, ['notes', '--lang', 'German']);
		const invalid = runCli(catalogue.root, ['notes']);

		deepStrictEqual([tag.status, invalid.status], [1, 1]);
		ok(tag.stderr.includes('✖ "German" is not a language tag such as "es" or "pt-BR"'));
		ok(invalid.stderr.includes('✖ i18n/context/notes.fr.json is not valid JSON: '));
	});
});
