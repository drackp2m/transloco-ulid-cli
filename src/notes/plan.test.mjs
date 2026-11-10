import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, describe, test } from 'node:test';

import { NOTE_TEXTS } from '../catalogue/note-texts.mjs';
import { SPANISH_NOTES } from '../testing/catalogue.mjs';

import { planNotes } from './plan.mjs';

const DIRS = [];

after(() => {
	for (const dir of DIRS) {
		rmSync(dir, { recursive: true, force: true });
	}
});

function catalogueWith(notes) {
	const i18nDir = mkdtempSync(path.join(tmpdir(), 'i18n-notes-plan-'));

	DIRS.push(i18nDir);

	if (undefined !== notes) {
		const text = 'string' === typeof notes ? notes : JSON.stringify(notes, null, '\t');

		mkdirSync(path.join(i18nDir, 'context'));
		writeFileSync(path.join(i18nDir, 'context', 'notes.es.json'), text, 'utf8');
	}

	return i18nDir;
}

const planIn = (i18nDir) => planNotes({ i18nDir, lang: 'es' });

describe('planNotes', () => {
	test('starts a file that is not there from the English template, and writes nothing yet', () => {
		const i18nDir = catalogueWith();
		const plan = planIn(i18nDir);

		deepStrictEqual([plan.created, plan.added], [true, Object.keys(NOTE_TEXTS)]);
		deepStrictEqual(JSON.parse(plan.content), NOTE_TEXTS);
		strictEqual(plan.content, `${JSON.stringify(NOTE_TEXTS, null, '\t')}\n`);
		strictEqual(existsSync(plan.file), false);
	});

	test('adds only the texts a file lacks, in English, keeping every one it has', () => {
		const notes = { ...SPANISH_NOTES, extra: 'una nota que la plantilla no tiene' };

		delete notes.genderless;
		delete notes.outdated;

		const plan = planIn(catalogueWith(notes));
		const written = JSON.parse(plan.content);

		deepStrictEqual([plan.created, plan.added], [false, ['genderless', 'outdated']]);
		deepStrictEqual(written, {
			...SPANISH_NOTES,
			genderless: NOTE_TEXTS.genderless,
			outdated: NOTE_TEXTS.outdated,
			extra: 'una nota que la plantilla no tiene',
		});
		deepStrictEqual(Object.keys(written), [...Object.keys(NOTE_TEXTS), 'extra']);
	});

	test('has nothing to write when the file has every text, translated or not', () => {
		const plan = planIn(catalogueWith({ ...SPANISH_NOTES, outdated: NOTE_TEXTS.outdated }));

		deepStrictEqual([plan.added, plan.content], [[], null]);
	});

	test('refuses a file that is not valid JSON, or not an object', () => {
		const invalid = planIn(catalogueWith('{ "outdated": '));
		const list = planIn(catalogueWith('["se usa con"]'));

		strictEqual(invalid.problem.startsWith(`${invalid.file} is not valid JSON: `), true);
		strictEqual(list.problem, `${list.file} is not a JSON object`);
	});
});
