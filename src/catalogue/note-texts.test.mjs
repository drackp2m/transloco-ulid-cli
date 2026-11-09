import { deepStrictEqual, strictEqual, throws } from 'node:assert/strict';
import { describe, test } from 'node:test';

import { DEFAULT_NOTES_LANG, NOTES_LANGS, noteTextsFor } from './note-texts.mjs';

const shapeOf = (texts) =>
	Object.entries(texts)
		.map(([name, value]) => `${name}: ${typeof value}`)
		.sort();

describe('noteTextsFor', () => {
	test('writes in English unless told otherwise', () => {
		strictEqual(DEFAULT_NOTES_LANG, 'en');
		strictEqual(noteTextsFor(), noteTextsFor('en'));
	});

	test('writes in English or in Spanish', () => {
		deepStrictEqual(NOTES_LANGS, ['en', 'es']);
	});

	test('gives every language the same texts, and a word for each gender', () => {
		const english = noteTextsFor('en');

		for (const lang of NOTES_LANGS) {
			const texts = noteTextsFor(lang);

			deepStrictEqual(shapeOf(texts), shapeOf(english), lang);
			deepStrictEqual(Object.keys(texts.genders), ['male', 'female'], lang);
		}
	});

	test('refuses a language it has no texts for', () => {
		throws(() => noteTextsFor('fr'), /^Error: unknown notes language "fr" — use one of en, es$/);
	});
});
