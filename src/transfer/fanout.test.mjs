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

	test('shows the "other" branch of the source in every form', () => {
		const forms = build(PLURAL, 'ru-RU');

		deepStrictEqual(new Set(forms.map((form) => form.source)), new Set(['# ejercicios']));
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

	test('leaves every form empty when the translation is still flat text', () => {
		const forms = build(PLURAL, 'ru-RU', 'Упражнения');

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
