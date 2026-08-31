import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { describe, test } from 'node:test';

import { formsOf } from './fanout.mjs';

const PLURAL = '{count, plural, one {# ejercicio} other {# ejercicios}}';

const GENDER =
	'{gender, select, male {Bienvenido} female {Bienvenida} other {Te damos la bienvenida}}';

const CROSS =
	'{count, plural, ' +
	'one {{gender, select, male {Resuelto #} female {Resuelta #} other {Has resuelto #}}} ' +
	'other {{gender, select, male {Resueltos #} female {Resueltas #} other {Has resuelto #}}}}';

const RUSSIAN =
	'{count, plural, one {# упражнение} few {# упражнения} many {# упражнений} ' +
	'other {# упражнения}}';

const DEFAULT_LANG = 'es-ES';

const build = (source, lang, target = '') =>
	formsOf({ source, target, lang, defaultLang: DEFAULT_LANG });

const suffixes = (forms) => forms.map((form) => form.suffix);

const noteOf = (form, category) =>
	form.notes.find((note) => note.category === category)?.text ?? null;

const formAt = (forms, suffix) => forms.find((form) => form.suffix === suffix);

describe('formsOf without ICU', () => {
	test('hands a plain string over as the single form it is today', () => {
		const forms = build('Hola {name}', 'en-GB', 'Hi {name}');

		deepStrictEqual(forms, [
			{ suffix: '', source: 'Hola {name}', target: 'Hi {name}', hash: false, notes: [] },
		]);
	});

	test('does not fan out a string that does not parse', () => {
		deepStrictEqual(suffixes(build('Hola {name', 'ru-RU')), ['']);
	});

	test('does not fan out a selectordinal, which the catalogue rejects anyway', () => {
		const source = '{n, selectordinal, one {#º} other {#º}}';

		deepStrictEqual(suffixes(build(source, 'en-GB')), ['']);
	});
});

describe('formsOf over a plural', () => {
	test('asks a two-form language for two forms', () => {
		deepStrictEqual(suffixes(build(PLURAL, 'en-GB')), ['#plural:one', '#plural:other']);
	});

	test('asks Russian for the four forms it selects', () => {
		deepStrictEqual(suffixes(build(PLURAL, 'ru-RU')), [
			'#plural:one',
			'#plural:few',
			'#plural:many',
			'#plural:other',
		]);
	});

	test('collapses Indonesian into the single form it has', () => {
		deepStrictEqual(suffixes(build(PLURAL, 'id-ID')), ['#plural:other']);
	});

	test('leaves the Spanish "many" out, the way the whitelist decided', () => {
		deepStrictEqual(suffixes(build(PLURAL, 'ca-ES')), ['#plural:one', '#plural:other']);
	});

	// Category to category where the source has it — its `one` is the singular the target's
	// `one` is asking for — and the generic `other` only where it does not.
	test('shows a category the source declares its own branch, and the rest "other"', () => {
		const forms = build(PLURAL, 'ru-RU');

		strictEqual(formAt(forms, '#plural:one').source, '# ejercicio');
		strictEqual(formAt(forms, '#plural:few').source, '# ejercicios');
		strictEqual(formAt(forms, '#plural:many').source, '# ejercicios');
		strictEqual(formAt(forms, '#plural:other').source, '# ejercicios');
	});

	test('marks the forms as carrying an octothorpe', () => {
		ok(build(PLURAL, 'en-GB').every((form) => true === form.hash));
	});

	test('keeps an exact case and takes its source from its own branch', () => {
		const source = '{count, plural, =0 {No hay nada} one {# ejercicio} other {# ejercicios}}';
		const forms = build(source, 'en-GB');

		deepStrictEqual(suffixes(forms), ['#plural:=0', '#plural:one', '#plural:other']);
		strictEqual(formAt(forms, '#plural:=0').source, 'No hay nada');
		strictEqual(noteOf(formAt(forms, '#plural:=0'), 'examples'), 'se usa exactamente con 0');
	});
});

describe('formsOf and the target', () => {
	test('gives each form the branch the stored translation already has', () => {
		const forms = build(PLURAL, 'ru-RU', RUSSIAN);

		strictEqual(formAt(forms, '#plural:few').target, '# упражнения');
		strictEqual(formAt(forms, '#plural:many').target, '# упражнений');
	});

	test('leaves a form the translation has no branch for empty', () => {
		const half = '{count, plural, one {# упражнение} other {# упражнения}}';
		const forms = build(PLURAL, 'ru-RU', half);

		strictEqual(formAt(forms, '#plural:one').target, '# упражнение');
		strictEqual(formAt(forms, '#plural:many').target, '');
	});

	// A leaf with no path at all agrees with every path it is held against, so a flat
	// translation would otherwise come back prefilled into all four Russian forms — the very
	// "same sentence four times" the fan-out exists to stop.
	test('leaves every form empty when the translation is still flat text', () => {
		const forms = build(PLURAL, 'ru-RU', 'Упражнения');

		ok(forms.every((form) => '' === form.target));
	});

	test('ignores a translation that branches on something else entirely', () => {
		const forms = build(PLURAL, 'ru-RU', '{gender, select, male {a} other {b}}');

		ok(forms.every((form) => '' === form.target));
	});

	test('ignores a translation whose ICU does not parse', () => {
		const forms = build(PLURAL, 'ru-RU', '{count, plural, one {a}');

		ok(forms.every((form) => '' === form.target));
	});
});

describe('formsOf over a gender select', () => {
	test('expands the three forms in a language that marks gender', () => {
		deepStrictEqual(suffixes(build(GENDER, 'ru-RU')), [
			'#gender:male',
			'#gender:female',
			'#gender:other',
		]);
	});

	test('collapses into one form in a language that marks none', () => {
		const forms = build(GENDER, 'tr-TR');

		deepStrictEqual(suffixes(forms), ['#gender:other']);
		ok(noteOf(forms[0], 'gender-note').includes('no marca género'));
	});

	test('repeats the rule about "other" on the form that needs it', () => {
		const forms = build(GENDER, 'es-ES');

		ok(noteOf(formAt(forms, '#gender:other'), 'gender-note').includes('reformula la frase'));
		ok(noteOf(formAt(forms, '#gender:female'), 'gender-note').includes('mujer'));
	});

	test('does not mark a gender form as carrying an octothorpe', () => {
		ok(build(GENDER, 'es-ES').every((form) => false === form.hash));
	});

	// The plural rule — always show the source's `other` — is wrong here and used to be
	// applied all the same: what a select asks for is always among what the source writes,
	// so the `other` fallback never saved anything and lost the wording every time.
	test('shows each gender the branch the source wrote for it', () => {
		const forms = build(GENDER, 'ru-RU');

		strictEqual(formAt(forms, '#gender:male').source, 'Bienvenido');
		strictEqual(formAt(forms, '#gender:female').source, 'Bienvenida');
		strictEqual(formAt(forms, '#gender:other').source, 'Te damos la bienvenida');
	});

	test('gives the collapsed form the neutral branch, which is the one that fits', () => {
		strictEqual(build(GENDER, 'tr-TR')[0].source, 'Te damos la bienvenida');
	});
});

const STATUS = '{status, select, ok {Todo bien} ko {Ha fallado} other {Sin datos}}';

describe('formsOf over a select that is not gender', () => {
	test('asks for every branch the source declares, whatever the language', () => {
		deepStrictEqual(suffixes(build(STATUS, 'tr-TR')), [
			'#status:ok',
			'#status:ko',
			'#status:other',
		]);
	});

	// These branches are not grammatical variants of one sentence, they are different
	// sentences: sending `other` three times would drop two of them on the floor.
	test('shows each branch its own text', () => {
		const forms = build(STATUS, 'en-GB');

		deepStrictEqual(
			forms.map((form) => form.source),
			['Todo bien', 'Ha fallado', 'Sin datos'],
		);
	});

	test('does not mark it as carrying an octothorpe', () => {
		ok(build(STATUS, 'en-GB').every((form) => false === form.hash));
	});
});

const TWO_PLURALS =
	'{a, plural, one {# ejercicio} other {# ejercicios}} de ' +
	'{b, plural, one {# ronda} other {# rondas}}';

describe('formsOf over two plurals in one sentence', () => {
	test('crosses them and names each one in the suffix', () => {
		deepStrictEqual(suffixes(build(TWO_PLURALS, 'en-GB')), [
			'#a:one#b:one',
			'#a:one#b:other',
			'#a:other#b:one',
			'#a:other#b:other',
		]);
	});

	// Both dimensions write `plural:` into the leaf path, so matching a combination by the
	// segments it contains found whichever leaf came first: all four forms used to be
	// handed the same source, and not even one of the four that was asked for.
	test('gives each combination the leaf that is actually its own', () => {
		const forms = build(TWO_PLURALS, 'en-GB');

		strictEqual(formAt(forms, '#a:one#b:one').source, '# ejercicio de # ronda');
		strictEqual(formAt(forms, '#a:other#b:other').source, '# ejercicios de # rondas');
		strictEqual(formAt(forms, '#a:one#b:other').source, '# ejercicio de # rondas');
	});

	test('falls back per dimension when the target language asks for more', () => {
		const forms = build(TWO_PLURALS, 'ru-RU');

		strictEqual(forms.length, 16);
		strictEqual(formAt(forms, '#a:few#b:many').source, '# ejercicios de # rondas');
		strictEqual(formAt(forms, '#a:one#b:few').source, '# ejercicio de # rondas');
	});
});

describe('formsOf over gender crossed with plural', () => {
	test('puts gender before plural whatever the nesting is', () => {
		deepStrictEqual(suffixes(build(CROSS, 'en-GB')), [
			'#gender:male#plural:one',
			'#gender:male#plural:other',
			'#gender:female#plural:one',
			'#gender:female#plural:other',
			'#gender:other#plural:one',
			'#gender:other#plural:other',
		]);
	});

	test('reaches twelve forms in Russian and no more', () => {
		strictEqual(build(CROSS, 'ru-RU').length, 12);
	});

	// `one` wraps a select and `other` does not, so the `other` leaf is a level short: it is
	// still the leaf that answers for both genders, and used to fall through to the first.
	test('answers both genders from a branch the source only writes once', () => {
		const source =
			'{count, plural, one {{gender, select, male {Resuelto} other {Hecho}}} other {Nada}}';
		const forms = build(source, 'en-GB');

		strictEqual(formAt(forms, '#gender:male#plural:one').source, 'Resuelto');
		strictEqual(formAt(forms, '#gender:male#plural:other').source, 'Nada');
		strictEqual(formAt(forms, '#gender:other#plural:other').source, 'Nada');
	});

	test('names both dimensions in the category note', () => {
		const forms = build(CROSS, 'en-GB');

		strictEqual(
			noteOf(formAt(forms, '#gender:female#plural:one'), 'category'),
			'gender:female · plural:one',
		);
	});
});

describe('the notes each form carries', () => {
	test('writes the numbers that select the category', () => {
		const forms = build(PLURAL, 'ru-RU');

		strictEqual(noteOf(formAt(forms, '#plural:one'), 'examples'), 'se usa con 1, 21, 31, 41, 51…');
		ok(noteOf(formAt(forms, '#plural:few'), 'examples').startsWith('se usa con 2, 3, 4, 22'));
	});

	test('says of the Russian "other" that only decimals reach it', () => {
		const text = noteOf(formAt(build(PLURAL, 'ru-RU'), '#plural:other'), 'examples');

		strictEqual(
			text,
			'sólo la alcanzan los decimales: 0,5 · 1,5 · 2,5. Es obligatoria aunque no se vea nunca',
		);
	});

	test('writes a single example where the language has a single number', () => {
		strictEqual(noteOf(formAt(build(PLURAL, 'en-GB'), '#plural:one'), 'examples'), 'se usa con 1');
	});

	test('carries the sibling forms of the source, so the whole sentence is visible', () => {
		const siblings = noteOf(build(PLURAL, 'ru-RU')[0], 'siblings');

		strictEqual(siblings, 'es-ES · one: «# ejercicio» · other: «# ejercicios»');
	});

	test('labels a sibling of a crossed string with both categories', () => {
		const siblings = noteOf(build(CROSS, 'en-GB')[0], 'siblings');

		ok(siblings.startsWith('es-ES · one+male: «Resuelto #»'));
	});

	test('writes no notes at all for a string with no branches', () => {
		deepStrictEqual(build('Hola', 'ru-RU')[0].notes, []);
	});
});
