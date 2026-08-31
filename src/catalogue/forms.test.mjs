import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
	combosOf,
	dimensionsOf,
	formCountOf,
	labelOf,
	leafFor,
	pathOf,
	segmentOf,
	shapeOf,
	sourceSegmentOf,
	suffixOf,
} from './forms.mjs';
import { buildFrom, leavesOf } from './message.mjs';

const PLURAL = '{count, plural, one {# ejercicio} other {# ejercicios}}';

const GENDER =
	'{gender, select, male {Bienvenido} female {Bienvenida} other {Te damos la bienvenida}}';

// Plural on the outside and gender within, which is the order the fan-out reverses.
const CROSS =
	'{count, plural, ' +
	'one {{gender, select, male {Resuelto} female {Resuelta} other {Has resuelto}}} ' +
	'other {{gender, select, male {Resueltos} female {Resueltas} other {Has resuelto}}}}';

const TWO_PLURALS =
	'{a, plural, one {# ejercicio} other {# ejercicios}} de ' +
	'{b, plural, one {# ronda} other {# rondas}}';

describe('dimensionsOf', () => {
	test('finds nothing to open in a string with no branches', () => {
		deepStrictEqual(dimensionsOf('Cargados {loaded} de {total}'), []);
	});

	test('refuses a string that does not parse', () => {
		strictEqual(dimensionsOf('{count, plural, one {a}'), null);
	});

	test('refuses a selectordinal instead of opening it with cardinal categories', () => {
		strictEqual(dimensionsOf('{n, selectordinal, one {#º} other {#º}}'), null);
	});

	test('shows gender before plural however the source nests them', () => {
		deepStrictEqual(
			dimensionsOf(CROSS).map(({ arg }) => arg),
			['gender', 'count'],
		);
	});

	test('keeps the level each dimension has in the source, not the one it is shown at', () => {
		const [gender, count] = dimensionsOf(CROSS);

		strictEqual(count.level, 0);
		strictEqual(gender.level, 1);
	});

	test('labels the only plural "plural" and names an argument when there are two', () => {
		strictEqual(dimensionsOf(PLURAL)[0].label, 'plural');
		deepStrictEqual(
			dimensionsOf(TWO_PLURALS).map(({ label }) => label),
			['a', 'b'],
		);
	});
});

describe('formCountOf', () => {
	test('counts one form for a string that does not open', () => {
		strictEqual(formCountOf('Hola {name}', 'ru-RU'), 1);
		strictEqual(formCountOf('{n, selectordinal, one {#º} other {#º}}', 'ru-RU'), 1);
	});

	test('counts what the target language asks for and not what the source has', () => {
		strictEqual(formCountOf(PLURAL, 'en-GB'), 2);
		strictEqual(formCountOf(PLURAL, 'ru-RU'), 4);
		strictEqual(formCountOf(PLURAL, 'id-ID'), 1);
	});

	test('multiplies the dimensions, gender included', () => {
		strictEqual(formCountOf(CROSS, 'ru-RU'), 12);
		strictEqual(formCountOf(CROSS, 'tr-TR'), 2);
	});

	test('agrees with the combinations it declined to build', () => {
		const count = combosOf(dimensionsOf(CROSS), 'ru-RU').length;

		strictEqual(formCountOf(CROSS, 'ru-RU'), count);
	});
});

describe('sourceSegmentOf', () => {
	const stepFor = (text, arg, key) => ({
		dimension: dimensionsOf(text).find((dimension) => dimension.arg === arg),
		key,
	});

	test('falls back to "other" for a category the source does not have', () => {
		strictEqual(sourceSegmentOf(stepFor(PLURAL, 'count', 'few')), 'plural:other');
	});

	test('takes the branch the source does have, which is always so in a select', () => {
		strictEqual(sourceSegmentOf(stepFor(GENDER, 'gender', 'female')), 'select:female');
	});

	test('takes an exact case from its own branch', () => {
		const text = '{count, plural, =0 {Nada} one {#} other {#}}';

		strictEqual(sourceSegmentOf(stepFor(text, 'count', '=0')), 'plural:=0');
	});
});

describe('pathOf and leafFor', () => {
	test('lays a combo back out in source order before matching', () => {
		const [combo] = combosOf(dimensionsOf(CROSS), 'en-GB');

		deepStrictEqual(pathOf(combo, segmentOf), ['plural:one', 'select:male']);
	});

	test('tells two dimensions of the same type apart by their level', () => {
		const leaves = leavesOf(TWO_PLURALS);

		for (const combo of combosOf(dimensionsOf(TWO_PLURALS), 'en-GB')) {
			const wanted = combo.map(({ key }) => key).join('+');
			const found = leafFor(leaves, pathOf(combo, sourceSegmentOf));

			strictEqual(found.path.map((segment) => segment.split(':').pop()).join('+'), wanted);
		}
	});

	test('finds the leaf of a branch the source only writes on one side', () => {
		const text =
			'{count, plural, one {{gender, select, male {Resuelto} other {Hecho}}} other {Nada}}';
		const leaves = leavesOf(text);
		const dimensions = dimensionsOf(text);
		const combo = combosOf(dimensions, 'en-GB').find(
			(steps) => 'gender:male#plural:other' === suffixOf(steps).slice(1),
		);

		strictEqual(leafFor(leaves, pathOf(combo, sourceSegmentOf)).text, 'Nada');
	});

	test('answers null when no leaf matches instead of handing back the first', () => {
		strictEqual(leafFor(leavesOf(PLURAL), ['select:male']), null);
	});
});

describe('suffixOf and labelOf', () => {
	test('writes the suffix the export hangs on the unit id', () => {
		const [combo] = combosOf(dimensionsOf(CROSS), 'en-GB');

		strictEqual(suffixOf(combo), '#gender:male#plural:one');
		strictEqual(labelOf(combo[0]), 'gender:male');
	});

	test('writes nothing for a string that does not open', () => {
		strictEqual(suffixOf([]), '');
	});
});

describe('shapeOf', () => {
	test('hands buildFrom the source nesting and not the order the fan-out shows', () => {
		deepStrictEqual(shapeOf(dimensionsOf(CROSS)), [
			{ type: 'plural', arg: 'count', order: ['zero', 'one', 'two', 'few', 'many', 'other'] },
			{ type: 'select', arg: 'gender', order: ['male', 'female', 'other'] },
		]);
	});

	// The round trip the import will lean on: what comes out of `leavesOf` goes back in
	// through the shape this function derives, and lands on the string it started as.
	test('rebuilds a plural exactly as it was written', () => {
		strictEqual(buildFrom(leavesOf(PLURAL), shapeOf(dimensionsOf(PLURAL))), PLURAL);
	});

	// A gender value is not a CLDR category, so there is no canonical order to fall back on
	// but the source's own. Rebuilding alphabetically left every translated file shaped
	// unlike the Spanish it came from, which is what the full round trip showed.
	test('rebuilds a select in the order the source declares, and stays there', () => {
		const rebuilt = buildFrom(leavesOf(GENDER), shapeOf(dimensionsOf(GENDER)));

		strictEqual(rebuilt, GENDER);
		strictEqual(buildFrom(leavesOf(rebuilt), shapeOf(dimensionsOf(rebuilt))), rebuilt);
	});

	test('writes an exact case ahead of the categories, where the source has it', () => {
		const source = '{count, plural, =0 {Nada que hacer} one {# ejercicio} other {# ejercicios}}';

		strictEqual(buildFrom(leavesOf(source), shapeOf(dimensionsOf(source))), source);
	});

	test('carries every leaf of a crossed string through the round trip', () => {
		const textsOf = (text) =>
			leavesOf(text)
				.map((leaf) => `${[...leaf.path].sort().join('+')}=${leaf.text}`)
				.sort();
		const rebuilt = buildFrom(leavesOf(CROSS), shapeOf(dimensionsOf(CROSS)));

		deepStrictEqual(textsOf(rebuilt), textsOf(CROSS));
	});
});
