import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { after, describe, test } from 'node:test';

import { SPANISH_NOTES, createCatalogue, removeCatalogues } from './testing/catalogue.mjs';
import { runCli } from './testing/cli.mjs';
import {
	COMMENTED,
	DELETE,
	IN_A_COMMENT,
	LANGS,
	PLURAL,
	SAVE,
	STALE,
	project,
	read,
	withoutScopes,
	xliffOf,
} from './testing/project.mjs';

after(removeCatalogues);

describe('transloco-ulid export', () => {
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

	test('leaves out and lists the keys nothing uses, and sends them with --include-unused', () => {
		const catalogue = project([SAVE, { ...DELETE, used: false }]);
		const left = runCli(catalogue.root, ['export']);
		const leftOut = read(xliffOf(catalogue));
		const sent = runCli(catalogue.root, ['export', '--include-unused']);

		ok(left.stdout.includes('⚠ 1 key nobody uses left out: demo.DELETE'));
		ok(left.stdout.includes('Send them too with --include-unused.'));
		ok(!leftOut.includes('<source>Delete</source>'));
		ok(!sent.stdout.includes('nobody uses'));
		ok(read(xliffOf(catalogue)).includes('<source>Delete</source>'));
	});

	test('sends a key only a comment mentions, as a key in use', () => {
		const catalogue = createCatalogue({ langs: LANGS, keys: [SAVE, COMMENTED], usages: IN_A_COMMENT });
		const { stdout } = runCli(catalogue.root, ['export']);

		ok(!stdout.includes('nobody uses'));
		ok(read(xliffOf(catalogue)).includes('<source>Key</source>'));
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
});
