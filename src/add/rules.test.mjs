import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
	formProblem,
	formsToAsk,
	keyNameProblem,
	paramNameProblem,
	pluralProblems,
	pluralSource,
	strayMessage,
	strayParamsIn,
	textProblems,
} from './rules.mjs';

const scopeWith = (...names) => ({
	name: 'demo',
	keys: { entries: names.map((name) => ({ name })) },
});

describe('formsToAsk — the forms a plural asks for, by source language', () => {
	test('asks Spanish for one and other, never for the "many" of compact millions', () => {
		deepStrictEqual(formsToAsk('es-ES'), ['one', 'other']);
	});

	test('asks Russian for its four forms', () => {
		deepStrictEqual(formsToAsk('ru-RU'), ['one', 'few', 'many', 'other']);
	});

	test('asks Arabic for all six', () => {
		deepStrictEqual(formsToAsk('ar-EG'), ['zero', 'one', 'two', 'few', 'many', 'other']);
	});

	test('asks Japanese for other alone', () => {
		deepStrictEqual(formsToAsk('ja-JP'), ['other']);
	});

	test('falls back to one and other for a tag CLDR does not know', () => {
		deepStrictEqual(formsToAsk('xx-XX'), ['one', 'other']);
	});
});

describe('pluralSource', () => {
	test('writes the forms in canonical order, whatever order they came in', () => {
		const forms = new Map([
			['other', '# retos'],
			['one', '# reto'],
		]);

		strictEqual(pluralSource('count', forms), '{count, plural, one {# reto} other {# retos}}');
	});
});

describe('strayParamsIn — how a plural form counts', () => {
	test('takes # as the number', () => {
		deepStrictEqual(strayParamsIn('{count, plural, one {# reto} other {# retos}}'), []);
	});

	test('takes the plural param written by name as the number too', () => {
		deepStrictEqual(strayParamsIn('{count, plural, one {{count} reto} other {{count} retos}}'), []);
	});

	test('lets a plural never use its param', () => {
		deepStrictEqual(strayParamsIn('{count, plural, one {Un reto} other {Varios retos}}'), []);
	});

	test('flags every form that names another param instead of counting', () => {
		deepStrictEqual(strayParamsIn('{count, plural, one {{total} reto} other {{total} retos}}'), [
			{ argument: 'count', key: 'one', stray: ['total'] },
			{ argument: 'count', key: 'other', stray: ['total'] },
		]);
	});

	test('lets another param through next to #', () => {
		const text = '{count, plural, one {{name} tiene # reto} other {{name} tiene # retos}}';

		deepStrictEqual(strayParamsIn(text), []);
	});

	test('counts a # inside a select, and never takes the ambient gender for a stray', () => {
		const text = '{count, plural, other {{gender, select, male {# él} other {# elle}}}}';

		deepStrictEqual(strayParamsIn(text), []);
	});

	test('flags a form that names someone and does not count, even when that is on purpose', () => {
		const text = '{count, plural, one {Un reto de {name}} other {# retos de {name}}}';

		deepStrictEqual(strayParamsIn(text), [{ argument: 'count', key: 'one', stray: ['name'] }]);
	});

	test('has nothing to say about plain text or a string that does not parse', () => {
		deepStrictEqual(strayParamsIn('Hola {name}'), []);
		deepStrictEqual(strayParamsIn('{count, plural, one {{total'), []);
	});

	test('names the param and points at #', () => {
		strictEqual(
			strayMessage({ argument: 'count', stray: ['total'] }),
			'{total} is not the plural param {count}: write # for the number',
		);
		strictEqual(
			strayMessage({ argument: 'count', stray: ['a', 'b'] }),
			'{a}, {b} are not the plural param {count}: write # for the number',
		);
	});
});

describe('formProblem — one form as it is typed', () => {
	test('refuses an empty form', () => {
		strictEqual(formProblem('count', 'one', '  '), 'The "one" form is empty');
	});

	test('refuses a form that does not parse once it sits inside the plural', () => {
		strictEqual(
			formProblem('count', 'one', '{total'),
			'The "one" form is not valid ICU: Unexpected message end',
		);
	});

	test('takes a form that counts with #', () => {
		strictEqual(formProblem('count', 'one', '# reto'), null);
	});
});

describe('textProblems — the whole source text', () => {
	test('refuses an empty text', () => {
		deepStrictEqual(textProblems('', 'es-ES'), ['The text is empty']);
	});

	test('refuses a text that is not valid ICU', () => {
		deepStrictEqual(textProblems('Hola {name', 'es-ES'), [
			'The text is not valid ICU: Unexpected message end',
		]);
	});

	test('asks a Russian source for the forms a Spanish one would not need', () => {
		deepStrictEqual(textProblems('{count, plural, one {# a} other {# b}}', 'ru-RU'), [
			'{count} has no "few" branch, which "ru-RU" needs',
			'{count} has no "many" branch, which "ru-RU" needs',
		]);
		deepStrictEqual(textProblems('{count, plural, one {# a} other {# b}}', 'es-ES'), []);
	});

	test('takes plain text', () => {
		deepStrictEqual(textProblems('Hola', 'es-ES'), []);
	});
});

describe('pluralProblems — the param and the forms given for it', () => {
	test('refuses a param name that is not one', () => {
		const forms = new Map([
			['one', '# a'],
			['other', '# b'],
		]);

		deepStrictEqual(pluralProblems('1count', forms, 'es-ES'), ['1count is not a valid param name']);
	});

	test('names the forms the source language still needs, and an empty one', () => {
		const forms = new Map([
			['one', '# a'],
			['other', ''],
		]);

		deepStrictEqual(pluralProblems('count', forms, 'ru-RU'), [
			'The "other" form is empty',
			'"ru-RU" needs the forms one, few, many, other: missing few, many',
		]);
	});
});

describe('keyNameProblem and paramNameProblem', () => {
	test('refuses a name that is not SCREAMING_SNAKE_CASE', () => {
		strictEqual(keyNameProblem(scopeWith(), 'save'), 'save is not SCREAMING_SNAKE_CASE');
	});

	test('refuses a name the scope already has', () => {
		strictEqual(keyNameProblem(scopeWith('SAVE'), 'SAVE'), 'demo.SAVE already exists');
	});

	test('takes a free name', () => {
		strictEqual(keyNameProblem(scopeWith('SAVE'), 'DELETE'), null);
	});

	test('takes a param name and refuses one starting with a digit', () => {
		strictEqual(paramNameProblem('count'), null);
		strictEqual(paramNameProblem('2x'), '2x is not a valid param name');
	});
});
