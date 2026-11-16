import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { after, describe, test } from 'node:test';

import { NOTE_TEXTS } from './catalogue/note-texts.mjs';
import { SPANISH_NOTES, createCatalogue, removeCatalogues } from './testing/catalogue.mjs';
import { runCli } from './testing/cli.mjs';
import { LANGS, SAVE, project, read } from './testing/project.mjs';

after(removeCatalogues);

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
