import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import { describe, test } from 'node:test';

import { messageProblems } from './icu.mjs';

const typesOf = (text, lang) => messageProblems(text, lang).map(({ type }) => type);

const keysOf = (text, lang) => messageProblems(text, lang).map(({ key }) => key);

describe('messageProblems — syntax', () => {
	test('says nothing about plain text', () => {
		deepStrictEqual(messageProblems('Ciclo {index}', 'es-ES'), []);
	});

	test('reports ICU that does not parse, with the position the parser gives', () => {
		const [problem, ...rest] = messageProblems('Hola {name', 'es-ES');

		strictEqual(problem.type, 'icu-syntax');
		deepStrictEqual(problem.at, { line: 1, col: 11 });
		deepStrictEqual(rest, []);
	});

	test('reports nothing else once the string does not parse', () => {
		deepStrictEqual(typesOf('{count, plural, one {a}', 'ru-RU'), ['icu-syntax']);
	});
});

describe('messageProblems — other', () => {
	test('reports a plural with no "other" branch', () => {
		deepStrictEqual(typesOf('{count, plural, one {a}}', 'en-GB'), ['missing-other']);
	});

	test('reports a select with no "other" branch', () => {
		deepStrictEqual(typesOf('{gender, select, male {a} female {b}}', 'es-ES'), ['missing-other']);
	});

	test('does not report the missing "other" twice as a missing category', () => {
		deepStrictEqual(typesOf('{count, plural, one {a}}', 'es-ES'), ['missing-other']);
	});
});

describe('messageProblems — categories', () => {
	test('accepts the two forms Spanish can reach', () => {
		deepStrictEqual(messageProblems('{count, plural, one {#} other {#}}', 'es-ES'), []);
	});

	test('asks Spanish for the singular it left out', () => {
		deepStrictEqual(typesOf('{count, plural, other {#}}', 'es-ES'), ['missing-plural-category']);
		deepStrictEqual(keysOf('{count, plural, other {#}}', 'es-ES'), ['one']);
	});

	test('asks Russian for all four', () => {
		deepStrictEqual(keysOf('{count, plural, one {#} other {#}}', 'ru-RU'), ['few', 'many']);
	});

	test('asks Indonesian for one form and no more', () => {
		deepStrictEqual(messageProblems('{count, plural, other {#}}', 'id-ID'), []);
	});

	test('rejects a category the language does not declare', () => {
		deepStrictEqual(typesOf('{count, plural, one {a} few {b} other {c}}', 'es-ES'), [
			'unknown-plural-category',
		]);
	});

	// The whitelist is about what to ask for, not about what to forbid: `many` is a real
	// Spanish category, only unreachable without compact millions.
	test('accepts a declared category nothing selects, without ever asking for it', () => {
		deepStrictEqual(messageProblems('{count, plural, one {a} many {b} other {c}}', 'es-ES'), []);
	});

	test('takes an exact match for no category at all', () => {
		deepStrictEqual(messageProblems('{count, plural, =0 {nada} one {#} other {#}}', 'es-ES'), []);
	});

	test('leaves the categories alone for a language CLDR does not know', () => {
		deepStrictEqual(messageProblems('{count, plural, few {a} other {b}}', 'zz-ZZ'), []);
	});

	test('never asks a select for plural categories', () => {
		deepStrictEqual(messageProblems('{gender, select, male {a} other {b}}', 'ru-RU'), []);
	});

	test('reports the surplus branch and the missing one at once', () => {
		deepStrictEqual(typesOf('{count, plural, few {a} other {b}}', 'es-ES'), [
			'unknown-plural-category',
			'missing-plural-category',
		]);
		deepStrictEqual(keysOf('{count, plural, few {a} other {b}}', 'es-ES'), ['few', 'one']);
	});
});

describe('messageProblems — selectordinal', () => {
	test('rejects an ordinal outright', () => {
		deepStrictEqual(typesOf('{n, selectordinal, one {1.º} other {#.º}}', 'es-ES'), [
			'unsupported-argument',
		]);
	});
});

describe('messageProblems — nesting', () => {
	test('reaches a plural written inside a select branch', () => {
		const source = '{gender, select, male {{count, plural, one {a}}} other {b}}';
		const [problem, ...rest] = messageProblems(source, 'es-ES');

		strictEqual(problem.type, 'missing-other');
		strictEqual(problem.name, 'count');
		deepStrictEqual(rest, []);
	});
});
