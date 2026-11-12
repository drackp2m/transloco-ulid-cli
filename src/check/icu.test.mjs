import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import { describe, test } from 'node:test';

import { messageProblems, problemsIn, strayParamsIn, strayProblems } from './icu.mjs';

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

describe('messageProblems — the values of the gender select', () => {
	test('reports a branch the gender setting can never hold', () => {
		const source = '{gender, select, masculino {a} other {b}}';
		const [problem, ...rest] = messageProblems(source, 'es-ES');

		strictEqual(problem.type, 'unknown-gender-value');
		strictEqual(problem.key, 'masculino');
		deepStrictEqual(rest, []);
	});

	test('says nothing about the three values the setting does have', () => {
		const source = '{gender, select, male {a} female {b} other {c}}';

		deepStrictEqual(messageProblems(source, 'es-ES'), []);
	});

	test('leaves a select that is not the gender one alone', () => {
		const source = '{status, select, ok {a} ko {b} other {c}}';

		deepStrictEqual(messageProblems(source, 'es-ES'), []);
	});

	test('reports every branch that does not belong, not just the first', () => {
		const source = '{gender, select, masculino {a} femenino {b} other {c}}';

		deepStrictEqual(keysOf(source, 'es-ES'), ['masculino', 'femenino']);
	});
});

const WIDE =
	'{gender, select, ' +
	'male {{n, plural, one {a#} few {b#} many {c#} other {d#}}} ' +
	'female {{n, plural, one {e#} few {f#} many {g#} other {h#}}} ' +
	'other {{n, plural, one {i#} few {j#} many {k#} other {l#}}}}';

describe('messageProblems — how wide a string opens', () => {
	test('lets gender crossed with a plural through at exactly twelve', () => {
		deepStrictEqual(messageProblems(WIDE, 'ru-RU'), []);
	});

	test('counts the forms of the language asked about, not of the source', () => {
		const source = '{gender, select, male {{n, plural, one {a} other {b}}} other {c}}';

		deepStrictEqual(messageProblems(source, 'en-GB'), []);
	});

	test('lets two plurals crossed through at exactly sixteen', () => {
		const branch = 'one {x} few {x} many {x} other {y}';
		const source = `{a, plural, ${branch}} de {b, plural, ${branch}}`;

		deepStrictEqual(messageProblems(source, 'ru-RU'), []);
	});

	test('reports a string that opens past the cap, and says how wide', () => {
		const branch = 'one {x} few {x} many {x} other {y}';
		const source = `{a, plural, ${branch}} {b, plural, ${branch}} {c, plural, ${branch}}`;
		const [problem, ...rest] = messageProblems(source, 'ru-RU');

		strictEqual(problem.type, 'too-many-forms');
		strictEqual(problem.name, null);
		strictEqual(
			problem.message,
			'opens into 64 forms in "ru-RU", over the 16 allowed — ' +
				'split the sentence instead of branching it further',
		);
		deepStrictEqual(rest, []);
	});

	test('lets that same string through in a language that asks for fewer forms', () => {
		const branch = 'one {x} few {x} many {x} other {y}';
		const source = `{a, plural, ${branch}} {b, plural, ${branch}} {c, plural, ${branch}}`;

		strictEqual(typesOf(source, 'en-GB').includes('too-many-forms'), false);
	});

	test('counts in every language it is given, and names each one past the cap', () => {
		const branch = 'one {x} other {y}';
		const source = `{a, plural, ${branch}} {b, plural, ${branch}} {c, plural, ${branch}}`;
		const langs = ['es-ES', 'en-GB', 'ru-RU', 'ar'];
		const [problem, ...rest] = messageProblems(source, 'es-ES', { langs });

		strictEqual(problem.type, 'too-many-forms');
		strictEqual(
			problem.message.startsWith('opens into 64 forms in "ru-RU" and 216 forms in "ar",'),
			true,
		);
		deepStrictEqual(rest, []);
	});

	test('keeps the categories to the language of the string while it counts in others', () => {
		const source = '{gender, select, male {{n, plural, one {a} other {b}}} female {c} other {d}}';
		const inArabic = messageProblems(source, 'es-ES', { langs: ['es-ES', 'ar'] });

		deepStrictEqual(messageProblems(source, 'es-ES', { langs: ['es-ES', 'ru-RU'] }), []);
		deepStrictEqual(inArabic.map(({ type }) => type), ['too-many-forms']);
		strictEqual(inArabic[0].message.includes('18 forms in "ar"'), true);
	});

	test('has nothing to count in a string with no branches at all', () => {
		deepStrictEqual(messageProblems('Cargados {loaded} de {total}', 'ru-RU'), []);
	});
});

describe('messageProblems — # under more than one plural', () => {
	const TWO =
		'Tienes {messages, plural, one {# mensaje} other {# mensajes}} de ' +
		'{friends, plural, one {# amigo} other {# amigos}}';

	test('reports it, since the forms of the export no longer say which number each # is', () => {
		const [problem, ...rest] = messageProblems(TWO, 'es-ES');

		strictEqual(problem.type, 'ambiguous-hash');
		strictEqual(problem.name, null);
		strictEqual(
			problem.message,
			'writes # under {messages} and {friends}, and once its forms are split nothing says ' +
				'which number each # is — write {messages, number} or {friends, number} instead',
		);
		deepStrictEqual(rest, []);
	});

	test('reports a single # too, wherever it is nested', () => {
		const source = '{a, plural, one {x} other {{b, plural, one {# y} other {z}}}}';

		deepStrictEqual(typesOf(source, 'es-ES'), ['ambiguous-hash']);
	});

	test('names every plural when there are more than two', () => {
		const source =
			'{a, plural, one {#} other {#}} {b, plural, one {x} other {y}} ' +
			'{c, plural, one {x} other {y}}';

		strictEqual(
			messageProblems(source, 'es-ES')[0].message.endsWith(
				'write {a, number}, {b, number} or {c, number} instead',
			),
			true,
		);
	});

	test('accepts two plurals that write each number by name', () => {
		const source =
			'Tienes {messages, plural, one {{messages, number} mensaje} ' +
			'other {{messages, number} mensajes}} de {friends, plural, ' +
			'one {{friends, number} amigo} other {{friends, number} amigos}}';

		deepStrictEqual(messageProblems(source, 'es-ES'), []);
	});

	test('accepts # under one plural, crossed with gender or branched on twice', () => {
		const crossed =
			'{gender, select, male {{n, plural, one {# a} other {# b}}} ' +
			'other {{n, plural, one {# c} other {# d}}}}';
		const twice = '{n, plural, one {# reto} other {# retos}} y {n, plural, one {lo} other {los}}';

		deepStrictEqual(messageProblems(crossed, 'es-ES'), []);
		deepStrictEqual(messageProblems(twice, 'es-ES'), []);
	});
});

describe('strayProblems — a plural form that names another param and never its number', () => {
	const messagesOf = (text) => strayProblems(text).map(({ message }) => message);

	test('says nothing when the form counts, with # or by name, or uses no param at all', () => {
		deepStrictEqual(strayProblems('{count, plural, one {# reto} other {# retos}}'), []);
		deepStrictEqual(strayProblems('{count, plural, one {{count} reto} other {# retos}}'), []);
		deepStrictEqual(strayProblems('{count, plural, one {Un reto} other {Varios retos}}'), []);
	});

	test('is one problem for the plural, naming the param and every form that has it', () => {
		const text = '{count, plural, one {{total} reto} other {{total} retos}}';

		deepStrictEqual(strayProblems(text), [
			{
				type: 'stray-plural-param',
				message:
					'names {total} and never the number in the "one" and "other" forms of {count} ' +
					'— write # if the number belongs there',
				name: 'total',
				key: null,
				at: null,
			},
		]);
	});

	test('names the one form when the rest count', () => {
		deepStrictEqual(messagesOf('{count, plural, one {Un reto de {name}} other {# retos}}'), [
			'names {name} and never the number in the "one" form of {count} ' +
				'— write # if the number belongs there',
		]);
	});

	test('lists every param such a form names', () => {
		deepStrictEqual(messagesOf('{count, plural, one {{a} {b}} other {#}}'), [
			'names {a} and {b} and never the number in the "one" form of {count} ' +
				'— write # if the number belongs there',
		]);
	});

	test('has nothing to say about plain text or about ICU that does not parse', () => {
		deepStrictEqual(strayProblems('Hola {name}'), []);
		deepStrictEqual(strayProblems('{count, plural, one {{total'), []);
	});

	test('takes the number written by name under a nested plural, and a # there for the other one', () => {
		const named =
			'{messages, plural, one {{friends, plural, one {{messages, number} de # amigo} ' +
			'other {{messages, number} de # amigos}}} other {{messages, number}}}';
		const hashed = '{messages, plural, one {{friends, plural, one {# a} other {# b}}} other {# m}}';

		deepStrictEqual(strayParamsIn(named), []);
		deepStrictEqual(strayParamsIn(hashed), [
			{ argument: 'messages', key: 'one', stray: ['friends'] },
		]);
	});

	test('stands on the forms strayParamsIn finds one by one', () => {
		deepStrictEqual(strayParamsIn('{count, plural, one {{total} reto} other {# retos}}'), [
			{ argument: 'count', key: 'one', stray: ['total'] },
		]);
	});

	test('is not part of what messageProblems reports for any language', () => {
		const text = '{count, plural, one {{total} reto} other {{total} retos}}';

		deepStrictEqual(messageProblems(text, 'es-ES', { langs: ['es-ES', 'en-GB'] }), []);
	});
});

describe('problemsIn — everything one text can be told on its own', () => {
	const STRAY = '{count, plural, one {{total} reto} other {# retos}}';

	test('is what messageProblems says for a translation', () => {
		deepStrictEqual(problemsIn(STRAY, 'ru-RU'), messageProblems(STRAY, 'ru-RU'));
		deepStrictEqual(problemsIn(STRAY, 'es-ES'), []);
	});

	test('adds, for the source, the forms that never write their number', () => {
		deepStrictEqual(
			problemsIn(STRAY, 'es-ES', { source: true }).map(({ type }) => type),
			['stray-plural-param'],
		);
	});

	test('measures the source across the languages it is given', () => {
		const three =
			'{a, plural, one {x} other {y}} {b, plural, one {x} other {y}} ' +
			'{c, plural, one {x} other {y}}';
		const langs = ['es-ES', 'ru-RU'];

		deepStrictEqual(
			problemsIn(three, 'es-ES', { langs, source: true }).map(({ type }) => type),
			['too-many-forms'],
		);
		deepStrictEqual(problemsIn(three, 'es-ES', { langs }), []);
	});
});
