import { ok, strictEqual } from 'node:assert/strict';
import { describe, test } from 'node:test';

import { messageProblems } from './icu.mjs';
import { spotPositionOf, syntaxPositionOf } from './rules.mjs';

const ULID = '01J9ZQ4W7K2M6X8Y0B3C5D7E9F';

const fileWith = (value) => `{\n\t"${ULID}": ${JSON.stringify(value)}\n}\n`;

const lineOf = (text) => text.split('\n')[1];

const firstProblem = (value) => messageProblems(value, 'es-ES')[0];

describe('spotPositionOf', () => {
	test('points an unknown category at the branch that opens it', () => {
		const value = '{count, plural, one {a} few {b} other {c}}';
		const text = fileWith(value);
		const problem = firstProblem(value);
		const { line, col } = spotPositionOf(text, ULID, problem);

		strictEqual(problem.type, 'unknown-plural-category');
		strictEqual(line, 2);
		ok(
			lineOf(text)
				.slice(col - 1)
				.startsWith('few {'),
		);
	});

	test('falls back to the argument heading for a category with no branch', () => {
		const value = '{count, plural, other {b}}';
		const text = fileWith(value);
		const problem = firstProblem(value);
		const { line, col } = spotPositionOf(text, ULID, problem);

		strictEqual(problem.type, 'missing-plural-category');
		strictEqual(line, 2);
		ok(
			lineOf(text)
				.slice(col - 1)
				.startsWith('{count, plural, '),
		);
	});
});

describe('syntaxPositionOf', () => {
	test('lands inside the value and never on the ULID', () => {
		const value = 'Hola {name';
		const text = fileWith(value);
		const raw = lineOf(text);
		const { line, col } = syntaxPositionOf(text, ULID, firstProblem(value).at, value);

		strictEqual(line, 2);
		ok(col > raw.indexOf(ULID) + ULID.length);
		strictEqual(col, raw.lastIndexOf('"') + 1);
	});

	test('counts the JSON escapes the value is written with on disk', () => {
		const value = 'Dice "hola" {name';
		const text = fileWith(value);
		const raw = lineOf(text);
		const { col } = syntaxPositionOf(text, ULID, firstProblem(value).at, value);

		strictEqual(col, raw.lastIndexOf('"') + 1);
		ok(col > raw.indexOf('Dice') + 1 + value.length);
	});
});
