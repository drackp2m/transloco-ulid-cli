import { deepStrictEqual, strictEqual, throws } from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, describe, test } from 'node:test';

import { SPANISH_NOTES } from '../testing/catalogue.mjs';

import {
	NOTE_TEXTS,
	fillNote,
	noteTextProblems,
	readNoteTexts,
	usableNoteTexts,
} from './note-texts.mjs';

const DIRS = [];

after(() => {
	for (const dir of DIRS) {
		rmSync(dir, { recursive: true, force: true });
	}
});

function contextDir(files = {}) {
	const dir = mkdtempSync(path.join(tmpdir(), 'i18n-notes-'));

	DIRS.push(dir);

	for (const [name, content] of Object.entries(files)) {
		const text = 'string' === typeof content ? content : JSON.stringify(content, null, '\t');

		writeFileSync(path.join(dir, name), text, 'utf8');
	}

	return dir;
}

const messagesOf = (problems) => problems.map(({ type, message }) => `${type}: ${message}`);

describe('the English template', () => {
	test('is what the notes are written in when nothing says otherwise', () => {
		const notes = readNoteTexts(contextDir());

		deepStrictEqual([notes.lang, notes.exists, notes.texts, notes.problems], ['en', false, NOTE_TEXTS, []]);
	});

	test('leaves a placeholder only where the code fills one', () => {
		const filled = Object.entries(NOTE_TEXTS)
			.filter(([, text]) => text.includes('{'))
			.map(([key, text]) => `${key} ${text.match(/\{\w+\}/g).join(' ')}`);

		deepStrictEqual(filled, [
			'pluralExactly {value}',
			'pluralNumbers {numbers}',
			'pluralDecimals {numbers}',
			'genderChosen {gender}',
			'neverTranslate {terms}',
		]);
	});

	test('has nothing to complain about in itself', () => {
		deepStrictEqual(noteTextProblems(NOTE_TEXTS), []);
	});
});

describe('fillNote', () => {
	test('fills each placeholder, and leaves one it has no value for as it is', () => {
		strictEqual(fillNote('{terms} and {other}', { terms: 'FEN, PGN' }), 'FEN, PGN and {other}');
	});
});

describe('readNoteTexts', () => {
	test('reads a translation of the template', () => {
		const notes = readNoteTexts(contextDir({ 'notes.es.json': SPANISH_NOTES }), 'es');

		deepStrictEqual([notes.exists, notes.texts, notes.problems], [true, SPANISH_NOTES, []]);
	});

	test('lets a project reword the English template as well', () => {
		const outdated = 'the source moved on: the target below is what it used to say';
		const dir = contextDir({ 'notes.en.json': { ...NOTE_TEXTS, outdated } });

		strictEqual(readNoteTexts(dir).texts.outdated, outdated);
	});

	test('asks for the file of any language but English, and has no texts without it', () => {
		const notes = readNoteTexts(contextDir(), 'fr');

		strictEqual(notes.texts, null);
		deepStrictEqual(messagesOf(notes.problems), [
			'missing-notes-file: notesLang is "fr" and there is no such file: translate the English ' +
				'template, src/catalogue/notes.en.json in @drackp2m/transloco-ulid-cli',
		]);
	});

	test('refuses a file that is not valid JSON', () => {
		const notes = readNoteTexts(contextDir({ 'notes.es.json': '{ "outdated": ' }), 'es');

		deepStrictEqual([notes.texts, notes.problems.map(({ type }) => type)], [null, ['invalid-json']]);
	});

	test('refuses a file that is not an object of texts', () => {
		const notes = readNoteTexts(contextDir({ 'notes.es.json': '["se usa con"]' }), 'es');

		deepStrictEqual(messagesOf(notes.problems), ['bad-note-text: the file is not a JSON object']);
	});

	test('names every text that is missing, empty or not a text, on its line', () => {
		const texts = { ...SPANISH_NOTES, genderMale: ' ', decimalPoint: 0 };

		delete texts.outdated;

		const notes = readNoteTexts(contextDir({ 'notes.es.json': texts }), 'es');

		strictEqual(notes.texts, null);
		deepStrictEqual(
			notes.problems.map(({ message, line }) => `${line ?? '-'} ${message}`),
			['5 "decimalPoint" is not a text', '7 "genderMale" is empty', '- "outdated" is missing'],
		);
	});

	test('names a placeholder the translation drops, and one it makes up', () => {
		const texts = {
			...SPANISH_NOTES,
			pluralNumbers: 'se usa con varios',
			neverTranslate: 'No traducir nunca: {terms} ni {names}',
		};
		const notes = readNoteTexts(contextDir({ 'notes.es.json': texts }), 'es');

		deepStrictEqual(messagesOf(notes.problems), [
			'bad-note-text: "pluralNumbers" drops {numbers}',
			'bad-note-text: "neverTranslate" has {names}, which the template does not',
		]);
	});

	test('warns about a text the template does not have, and uses the file all the same', () => {
		const notes = readNoteTexts(
			contextDir({ 'notes.es.json': { ...SPANISH_NOTES, general: 'es la forma general' } }),
			'es',
		);

		deepStrictEqual(messagesOf(notes.problems), [
			'unknown-note-text: "general" is not in the template',
		]);
		deepStrictEqual(notes.texts, SPANISH_NOTES);
	});
});

describe('usableNoteTexts', () => {
	test('hands over the texts of a file that has them', () => {
		const dir = contextDir({ 'notes.es.json': SPANISH_NOTES });

		deepStrictEqual(usableNoteTexts(readNoteTexts(dir, 'es')), SPANISH_NOTES);
	});

	test('fails naming the file and why it cannot be used', () => {
		const dir = contextDir();

		throws(
			() => usableNoteTexts(readNoteTexts(dir, 'fr')),
			(error) =>
				error.message.startsWith(`${path.join(dir, 'notes.fr.json')}: notesLang is "fr"`),
		);
	});
});
