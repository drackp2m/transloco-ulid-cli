import { deepStrictEqual, ok, strictEqual, throws } from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
	IcuSyntaxError,
	buildFrom,
	isIcu,
	leavesOf,
	paramsOf,
	parse,
	signatureDiff,
	spotsIn,
} from './message.mjs';

describe('parse', () => {
	test('returns the token array for plain text', () => {
		deepStrictEqual(
			parse('texto plano').map((token) => token.type),
			['content'],
		);
	});

	test('throws IcuSyntaxError with the position on malformed input', () => {
		throws(
			() => parse('Hola {name'),
			(error) => {
				ok(error instanceof IcuSyntaxError);
				strictEqual(error.line, 1);
				strictEqual(error.col, 11);

				return true;
			},
		);
	});
});

describe('isIcu', () => {
	test('is false for plain text', () => {
		strictEqual(isIcu('texto plano'), false);
	});

	test('is false for a plain argument', () => {
		strictEqual(isIcu('Hola {name}'), false);
	});

	test('is true for a plural', () => {
		strictEqual(isIcu('{count, plural, one {#} other {#}}'), true);
	});

	test('is true for a select', () => {
		strictEqual(isIcu('{gender, select, male {a} other {b}}'), true);
	});
});

describe('paramsOf', () => {
	test('is empty for plain text', () => {
		deepStrictEqual([...paramsOf('texto plano').keys()], []);
	});

	test('marks a plain argument', () => {
		deepStrictEqual(paramsOf('Hola {name}').get('name'), { type: 'plain', cases: [] });
	});

	test('marks a plural with its categories', () => {
		const params = paramsOf('{count, plural, one {# item} other {# items}}');

		deepStrictEqual(params.get('count'), { type: 'plural', cases: ['one', 'other'] });
	});

	test('marks a select with its categories', () => {
		const params = paramsOf('{gender, select, male {a} female {b} other {c}}');

		deepStrictEqual(params.get('gender'), {
			type: 'select',
			cases: ['male', 'female', 'other'],
		});
	});

	test('finds arguments nested inside a plural branch, merging repeats', () => {
		const params = paramsOf(
			'Cargados {loaded, plural, one {# de {total}} other {# de {total}}} ejercicios',
		);

		deepStrictEqual(params.get('total'), { type: 'plain', cases: [] });
		deepStrictEqual(params.get('loaded'), { type: 'plural', cases: ['one', 'other'] });
	});
});

describe('leavesOf', () => {
	test('returns a single leaf with the whole text when there is no ICU', () => {
		deepStrictEqual(leavesOf('Hola {name}, bienvenido'), [
			{ path: [], text: 'Hola {name}, bienvenido' },
		]);
	});

	test('splits a bare plural into one leaf per category', () => {
		deepStrictEqual(leavesOf('{count, plural, one {# ejercicio} other {# ejercicios}}'), [
			{ path: ['plural:one'], text: '# ejercicio' },
			{ path: ['plural:other'], text: '# ejercicios' },
		]);
	});

	test('carries the surrounding text into every leaf', () => {
		const leaves = leavesOf(
			'Cargados {loaded, plural, one {# ejercicio} other {# ejercicios}} de {total}',
		);

		deepStrictEqual(leaves, [
			{ path: ['plural:one'], text: 'Cargados # ejercicio de {total}' },
			{ path: ['plural:other'], text: 'Cargados # ejercicios de {total}' },
		]);
	});

	test('keeps escaped literal braces as raw source instead of unescaping them', () => {
		const leaves = leavesOf("{n, plural, one {it's a '{brace}' # thing} other {# things}}");

		strictEqual(leaves[0].text, "it's a '{brace}' # thing");
	});
});

describe('leavesOf nesting', () => {
	test('produces the cross product for a select nested inside a plural', () => {
		const leaves = leavesOf(
			'{gender, select, ' +
				'male {Ha completado {count, plural, one {# ejercicio} other {# ejercicios}}} ' +
				'female {Ha completado {count, plural, one {# ejercicio} other {# ejercicios}}} ' +
				'other {Completado: {count, plural, one {# ejercicio} other {# ejercicios}}}}',
		);

		deepStrictEqual(
			leaves.map((leaf) => leaf.path),
			[
				['select:male', 'plural:one'],
				['select:male', 'plural:other'],
				['select:female', 'plural:one'],
				['select:female', 'plural:other'],
				['select:other', 'plural:one'],
				['select:other', 'plural:other'],
			],
		);
		deepStrictEqual(
			leaves.find((leaf) => 'select:other,plural:one' === leaf.path.join()).text,
			'Completado: # ejercicio',
		);
	});
});

describe('buildFrom round-trips', () => {
	test('rebuilds the canonical string for a bare plural', () => {
		const source = '{count, plural, one {# ejercicio} other {# ejercicios}}';
		const rebuilt = buildFrom(leavesOf(source), [{ type: 'plural', arg: 'count' }]);

		deepStrictEqual(leavesOf(rebuilt), leavesOf(source));
	});

	test('round-trips a select nested inside a plural', () => {
		const source =
			'{gender, select, ' +
			'male {Ha completado {count, plural, one {# ejercicio} other {# ejercicios}}} ' +
			'female {Ha completado {count, plural, one {# ejercicio} other {# ejercicios}}} ' +
			'other {Completado: {count, plural, one {# ejercicio} other {# ejercicios}}}}';
		const shape = [
			{ type: 'select', arg: 'gender' },
			{ type: 'plural', arg: 'count' },
		];
		const rebuilt = buildFrom(leavesOf(source), shape);

		const byPath = (leaves) => new Map(leaves.map((leaf) => [leaf.path.join(), leaf.text]));

		deepStrictEqual(byPath(leavesOf(rebuilt)), byPath(leavesOf(source)));
	});

	test('rebuilds a message with no branching from its single leaf', () => {
		strictEqual(buildFrom(leavesOf('Hola {name}'), []), 'Hola {name}');
	});
});

describe('buildFrom ordering', () => {
	test('always emits categories in canonical order, regardless of leaf order', () => {
		const leaves = [
			{ path: ['plural:other'], text: '# ejercicios' },
			{ path: ['plural:few'], text: '# ejercicios (few)' },
			{ path: ['plural:one'], text: '# ejercicio' },
		];

		strictEqual(
			buildFrom(leaves, [{ type: 'plural', arg: 'count' }]),
			'{count, plural, one {# ejercicio} few {# ejercicios (few)} other {# ejercicios}}',
		);
	});

	test('builds a four-form plural for a language the origin does not have', () => {
		const leaves = [
			{ path: ['plural:one'], text: '# файл' },
			{ path: ['plural:few'], text: '# файла' },
			{ path: ['plural:many'], text: '# файлов' },
			{ path: ['plural:other'], text: '# файла' },
		];

		strictEqual(
			buildFrom(leaves, [{ type: 'plural', arg: 'count' }]),
			'{count, plural, one {# файл} few {# файла} many {# файлов} other {# файла}}',
		);
	});
});

describe('buildFrom errors', () => {
	test('throws when the "other" case is missing', () => {
		const leaves = [{ path: ['plural:one'], text: '# ejercicio' }];

		throws(() => buildFrom(leaves, [{ type: 'plural', arg: 'count' }]), /missing its "other" case/);
	});

	test('throws instead of silently merging two leaves for the same case', () => {
		const leaves = [
			{ path: ['plural:one'], text: 'a' },
			{ path: ['plural:one'], text: 'b' },
			{ path: ['plural:other'], text: 'c' },
		];

		throws(
			() => buildFrom(leaves, [{ type: 'plural', arg: 'count' }]),
			/expected exactly one leaf/,
		);
	});

	test('throws when a leaf path does not match the declared shape', () => {
		const leaves = [
			{ path: ['select:one'], text: 'a' },
			{ path: ['select:other'], text: 'b' },
		];

		throws(
			() => buildFrom(leaves, [{ type: 'plural', arg: 'count' }]),
			/has no "plural:…" segment/,
		);
	});
});

describe('buildFrom parse errors', () => {
	test('throws instead of writing back an ICU string that fails to parse', () => {
		throws(() => buildFrom([{ path: [], text: 'Hola {name' }], []), IcuSyntaxError);
	});
});

describe('spotsIn', () => {
	test('locates a plain argument', () => {
		deepStrictEqual(spotsIn('Hola {name}'), [
			{ name: 'name', type: 'plain', key: null, text: '{name}', index: 5, length: 6 },
		]);
	});

	test('locates the heading of a plural and every branch under it', () => {
		deepStrictEqual(
			spotsIn('{count, plural, one {# libro} other {# libros}}').map(({ type, key, text }) => [
				type,
				key,
				text,
			]),
			[
				['plural', null, '{count, plural, '],
				['plural', 'one', 'one {'],
				['plural', 'other', 'other {'],
			],
		);
	});

	test('points at the category itself, not at the space in front of it', () => {
		const source = '{count, plural, one {a} other {b}}';

		for (const spot of spotsIn(source)) {
			strictEqual(source.slice(spot.index, spot.index + spot.length), spot.text);
		}
	});

	test('is empty for a string that does not parse', () => {
		deepStrictEqual(spotsIn('Hola {name'), []);
	});
});

describe('signatureDiff', () => {
	test('reports a param written as another kind of argument', () => {
		const diff = signatureDiff('{count, plural, one {a} other {b}}', '{count, select, other {b}}');

		deepStrictEqual(diff.retyped, [{ name: 'count', expected: 'plural', actual: 'select' }]);
	});

	test('reports a select branch the source never declares', () => {
		const diff = signatureDiff(
			'{gender, select, male {a} other {b}}',
			'{gender, select, male {a} neuter {c} other {b}}',
		);

		deepStrictEqual(diff.surplus, [{ name: 'gender', cases: ['neuter'] }]);
	});

	test('lets the plural categories of a language differ from the source ones', () => {
		deepStrictEqual(
			signatureDiff(
				'{count, plural, one {a} other {b}}',
				'{count, plural, one {a} few {b} many {c} other {d}}',
			),
			{ dropped: [], added: [], retyped: [], surplus: [] },
		);
	});

	test('says nothing when one of the two sides does not parse', () => {
		deepStrictEqual(signatureDiff('Hola {name}', 'Hello {name'), {
			dropped: [],
			added: [],
			retyped: [],
			surplus: [],
		});
	});
});
