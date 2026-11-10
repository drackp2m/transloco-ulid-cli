import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { describe, test } from 'node:test';

import { SPANISH_NOTES } from '../testing/catalogue.mjs';

import { expandsGender, genderCategoriesOf, genderNoteFor, isGenderArg } from './genders.mjs';

const CASES = ['male', 'female', 'other'];

describe('expandsGender', () => {
	test('expands in the languages that mark agreement', () => {
		ok(expandsGender('es-ES'));
		ok(expandsGender('ru-RU'));
		ok(expandsGender('de-DE'));
	});

	test('collapses in the four languages that mark none', () => {
		ok(!expandsGender('tr-TR'));
		ok(!expandsGender('id-ID'));
		ok(!expandsGender('vi-VN'));
		ok(!expandsGender('zh-CN'));
	});
});

describe('genderCategoriesOf', () => {
	test('keeps the settings order whatever order the source declares', () => {
		deepStrictEqual(genderCategoriesOf('es-ES', ['other', 'female', 'male']), CASES);
	});

	test('asks only for what the source declares', () => {
		deepStrictEqual(genderCategoriesOf('es-ES', ['female', 'other']), ['female', 'other']);
	});

	test('asks a genderless language for the wildcard alone', () => {
		deepStrictEqual(genderCategoriesOf('vi-VN', CASES), ['other']);
	});
});

describe('genderNoteFor', () => {
	test('names the setting behind each form', () => {
		strictEqual(genderNoteFor('male', 'es-ES'), 'the person using the app has chosen “man”');
		strictEqual(genderNoteFor('female', 'es-ES'), 'the person using the app has chosen “woman”');
	});

	test('tells the translator to reword instead of inventing an ending', () => {
		ok(genderNoteFor('other', 'ru-RU').includes('Do not make up an ending: reword the sentence'));
	});

	test('says why a genderless language gets a single form', () => {
		strictEqual(genderNoteFor('other', 'tr-TR'), genderNoteFor('male', 'tr-TR'));
		ok(genderNoteFor('other', 'tr-TR').includes('does not mark gender'));
	});

	test('writes with the texts it is given', () => {
		strictEqual(
			genderNoteFor('female', 'ru-RU', SPANISH_NOTES),
			'quien usa la aplicación ha elegido «mujer»',
		);
		strictEqual(genderNoteFor('other', 'ru-RU', SPANISH_NOTES), SPANISH_NOTES.genderUnspecified);
		strictEqual(genderNoteFor('other', 'tr-TR', SPANISH_NOTES), SPANISH_NOTES.genderless);
	});
});

describe('isGenderArg', () => {
	test('knows the ambient argument from any other select', () => {
		ok(isGenderArg('gender'));
		ok(!isGenderArg('status'));
	});
});
