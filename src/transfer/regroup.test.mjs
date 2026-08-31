import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { describe, test } from 'node:test';

import { formsOf } from './fanout.mjs';
import { foldGroup, groupUnits, idPartsOf, isFlatGroup } from './regroup.mjs';

const ULID = '01K0000000000000000000000A';

const OTHER_ULID = '01K0000000000000000000000B';

const PLURAL = '{count, plural, one {# ejercicio} other {# ejercicios}}';

const GENDER =
	'{gender, select, male {Bienvenido} female {Bienvenida} other {Te damos la bienvenida}}';

const CROSS =
	'{count, plural, ' +
	'one {{gender, select, male {Resuelto #} female {Resuelta #} other {Has resuelto #}}} ' +
	'other {{gender, select, male {Resueltos #} female {Resueltas #} other {Has resuelto #}}}}';

const DEFAULT_LANG = 'es-ES';

const unitOf = (suffix, target, source = '') => ({
	id: `puzzle.${ULID}${suffix}`,
	notes: [],
	source,
	target,
});

const exported = (source, lang) => formsOf({ source, target: '', lang, defaultLang: DEFAULT_LANG });

function sent(source, lang, targets) {
	const units = exported(source, lang).map((form) =>
		unitOf(form.suffix, targets[form.suffix] ?? '', form.source),
	);

	return groupUnits(units)[0];
}

const fold = (group, source, lang) => foldGroup(group, { source, lang, defaultLang: DEFAULT_LANG });

const messages = (folded) => folded.problems.map((item) => item.message);

describe('groupUnits', () => {
	test('splits the form off the id and keeps the key it belongs to', () => {
		const groups = groupUnits([unitOf('#plural:one', 'a'), unitOf('#plural:other', 'b')]);

		strictEqual(groups.length, 1);
		strictEqual(groups[0].ulid, ULID);
		strictEqual(groups[0].head, `puzzle.${ULID}`);
		deepStrictEqual(
			groups[0].units.map((unit) => unit.suffix),
			['#plural:one', '#plural:other'],
		);
	});

	test('keeps the two dimensions of a crossed id together', () => {
		const [group] = groupUnits([unitOf('#gender:female#plural:few', 'a')]);

		strictEqual(group.units[0].suffix, '#gender:female#plural:few');
	});

	test('groups in the order the file has them, one group per key', () => {
		const other = { id: `puzzle.${OTHER_ULID}`, notes: [], source: '', target: 'b' };
		const units = [unitOf('#plural:one', 'a'), other, unitOf('#plural:other', 'c')];
		const groups = groupUnits(units);

		deepStrictEqual(
			groups.map((group) => group.ulid),
			[ULID, OTHER_ULID],
		);
		strictEqual(groups[0].units.length, 2);
	});

	test('reads a unit with no form as the flat group it is', () => {
		const [group] = groupUnits([unitOf('', 'Hola')]);

		ok(isFlatGroup(group));
		strictEqual(group.units[0].suffix, '');
	});

	test('does not take a scope-less id apart', () => {
		deepStrictEqual(idPartsOf(ULID), { head: ULID, ulid: ULID, suffix: '' });
	});
});

describe('foldGroup over a key with no forms', () => {
	test('hands the target over as it came', () => {
		const folded = fold(groupUnits([unitOf('', 'Hi {name}')])[0], 'Hola {name}', 'en-GB');

		deepStrictEqual(folded, { target: 'Hi {name}', empty: false, problems: [] });
	});

	test('counts an empty target as nothing to write', () => {
		const folded = fold(groupUnits([unitOf('', '  ')])[0], 'Hola', 'en-GB');

		strictEqual(folded.empty, true);
		deepStrictEqual(folded.problems, []);
	});

	test('reports a placeholder the translation dropped', () => {
		const folded = fold(groupUnits([unitOf('', 'Hi')])[0], 'Hola {name}', 'en-GB');

		deepStrictEqual(messages(folded), ['placeholders differ from es-ES']);
	});

	test('refuses a form when the source does not branch any more', () => {
		const units = [unitOf('#plural:one', 'a'), unitOf('#plural:other', 'b')];
		const folded = fold(groupUnits(units)[0], 'Hola', 'en-GB');

		strictEqual(folded.empty, true);
		deepStrictEqual(messages(folded), [
			'the source does not branch, so a form cannot be merged',
			'the source does not branch, so a form cannot be merged',
		]);
	});
});

describe('foldGroup over a plural', () => {
	test('rebuilds the two English forms into one ICU string', () => {
		const group = sent(PLURAL, 'en-GB', {
			'#plural:one': '# exercise',
			'#plural:other': '# exercises',
		});
		const folded = fold(group, PLURAL, 'en-GB');

		strictEqual(folded.target, '{count, plural, one {# exercise} other {# exercises}}');
		deepStrictEqual(folded.problems, []);
	});

	test('rebuilds the four Russian forms in the canonical order', () => {
		const group = sent(PLURAL, 'ru-RU', {
			'#plural:many': '# упражнений',
			'#plural:other': '# упражнения',
			'#plural:one': '# упражнение',
			'#plural:few': '# упражнения',
		});

		strictEqual(
			fold(group, PLURAL, 'ru-RU').target,
			'{count, plural, one {# упражнение} few {# упражнения} many {# упражнений} ' +
				'other {# упражнения}}',
		);
	});

	test('collapses into the single form an Indonesian file carries', () => {
		const group = sent(PLURAL, 'id-ID', { '#plural:other': '# latihan' });

		strictEqual(fold(group, PLURAL, 'id-ID').target, '{count, plural, other {# latihan}}');
	});

	test('keeps an exact case as its own branch', () => {
		const source = '{count, plural, =0 {No hay nada} one {# ejercicio} other {# ejercicios}}';
		const group = sent(source, 'en-GB', {
			'#plural:=0': 'Nothing here',
			'#plural:one': '# exercise',
			'#plural:other': '# exercises',
		});

		strictEqual(
			fold(group, source, 'en-GB').target,
			'{count, plural, one {# exercise} =0 {Nothing here} other {# exercises}}',
		);
	});
});

describe('foldGroup and the complete group', () => {
	test('writes nothing when one form of four came back empty', () => {
		const group = sent(PLURAL, 'ru-RU', {
			'#plural:one': '# упражнение',
			'#plural:few': '# упражнения',
			'#plural:many': '# упражнений',
		});
		const folded = fold(group, PLURAL, 'ru-RU');

		strictEqual(folded.target, '');
		strictEqual(folded.empty, true);
		deepStrictEqual(messages(folded), ['1 of 4 forms came back empty — the key is left untouched']);
	});

	test('writes nothing and says nothing when the whole key is untranslated', () => {
		const folded = fold(sent(PLURAL, 'ru-RU', {}), PLURAL, 'ru-RU');

		strictEqual(folded.empty, true);
		deepStrictEqual(folded.problems, []);
	});

	test('writes nothing when a form the language asks for is not in the file', () => {
		const units = exported(PLURAL, 'ru-RU')
			.filter((form) => '#plural:many' !== form.suffix)
			.map((form) => unitOf(form.suffix, 'что-то', form.source));
		const folded = fold(groupUnits(units)[0], PLURAL, 'ru-RU');

		strictEqual(folded.empty, true);
		deepStrictEqual(messages(folded), ['1 of 4 forms came back empty — the key is left untouched']);
	});

	test('refuses a form the language does not ask for', () => {
		const group = sent(PLURAL, 'en-GB', {
			'#plural:one': '# exercise',
			'#plural:other': '# exercises',
		});

		group.units.push({ ...unitOf('#plural:many', '# упражнений'), suffix: '#plural:many' });

		const folded = fold(group, PLURAL, 'en-GB');

		ok(messages(folded).includes('not a form this key has in this language'));
	});

	test('refuses a flat translation for a key that branches now', () => {
		const folded = fold(groupUnits([unitOf('', 'Exercises')])[0], PLURAL, 'en-GB');

		strictEqual(folded.empty, true);
		deepStrictEqual(messages(folded), [
			'the source branches now, so a flat translation cannot be merged',
		]);
	});

	test('reports a form that came back twice instead of taking both', () => {
		const group = sent(PLURAL, 'en-GB', {
			'#plural:one': '# exercise',
			'#plural:other': '# exercises',
		});

		group.units.push({ ...unitOf('#plural:one', 'otra cosa'), suffix: '#plural:one' });

		ok(messages(fold(group, PLURAL, 'en-GB')).includes('came back more than once'));
	});
});

describe('foldGroup and what it refuses to write', () => {
	test('writes nothing when a form brings ICU that does not parse', () => {
		const group = sent(PLURAL, 'en-GB', {
			'#plural:one': '# exercise',
			'#plural:other': '{broken',
		});
		const folded = fold(group, PLURAL, 'en-GB');

		strictEqual(folded.empty, true);
		ok(messages(folded).some((message) => message.startsWith('the forms do not rebuild')));
	});

	test('reports the octothorpe a form lost, the way it reports a parameter', () => {
		const group = sent(PLURAL, 'en-GB', {
			'#plural:one': 'one exercise',
			'#plural:other': '# exercises',
		});
		const folded = fold(group, PLURAL, 'en-GB');

		deepStrictEqual(messages(folded), ['placeholders differ from es-ES']);
		strictEqual(folded.empty, false);
	});

	test('takes the octothorpe of a branch as the placeholder it is', () => {
		const group = sent(PLURAL, 'en-GB', {
			'#plural:one': '# exercise',
			'#plural:other': '# exercises',
		});

		deepStrictEqual(fold(group, PLURAL, 'en-GB').problems, []);
	});
});

describe('foldGroup over a select', () => {
	test('rebuilds the three genders', () => {
		const group = sent(GENDER, 'ru-RU', {
			'#gender:male': 'Добро пожаловать',
			'#gender:female': 'Добро пожаловать',
			'#gender:other': 'Рады видеть',
		});

		strictEqual(
			fold(group, GENDER, 'ru-RU').target,
			'{gender, select, female {Добро пожаловать} male {Добро пожаловать} ' +
				'other {Рады видеть}}',
		);
	});

	test('rebuilds a language that marks no gender from its single form', () => {
		const group = sent(GENDER, 'tr-TR', { '#gender:other': 'Hoş geldiniz' });

		strictEqual(fold(group, GENDER, 'tr-TR').target, '{gender, select, other {Hoş geldiniz}}');
	});

	test('nests a crossed key the way the source nests it and not the way it was shown', () => {
		const targets = Object.fromEntries(
			exported(CROSS, 'en-GB').map((form) => [form.suffix, `${form.suffix}: #`]),
		);
		const target = fold(sent(CROSS, 'en-GB', targets), CROSS, 'en-GB').target;

		ok(target.startsWith('{count, plural, one {{gender, select, '));
		ok(target.includes('female {#gender:female#plural:one: #}'));
		ok(target.includes('female {#gender:female#plural:other: #}'));
	});
});

describe('the round trip', () => {
	test('gives the fan-out back what it asked for, form by form', () => {
		const targets = Object.fromEntries(
			exported(CROSS, 'ru-RU').map((form) => [form.suffix, `${form.suffix} #`]),
		);
		const built = fold(sent(CROSS, 'ru-RU', targets), CROSS, 'ru-RU').target;
		const again = formsOf({
			source: CROSS,
			target: built,
			lang: 'ru-RU',
			defaultLang: DEFAULT_LANG,
		});

		strictEqual(again.length, 12);
		deepStrictEqual(Object.fromEntries(again.map((form) => [form.suffix, form.target])), targets);
	});
});
