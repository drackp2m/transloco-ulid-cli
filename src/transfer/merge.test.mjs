import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { describe, test } from 'node:test';

import { formsOf } from './fanout.mjs';
import { planImport } from './merge.mjs';
import { OUTDATED_SUB_STATE } from './xliff.mjs';

const ULID = '01K0000000000000000000000A';

const NEW_ULID = '01K0000000000000000000000B';

const SOURCE = '{count, plural, one {# ejercicio} other {# ejercicios}}';

const RUSSIAN = {
	'#plural:one': '# упражнение',
	'#plural:few': '# упражнения',
	'#plural:many': '# упражнений',
	'#plural:other': '# упражнения',
};

const REBUILT =
	'{count, plural, one {# упражнение} few {# упражнения} many {# упражнений} ' +
	'other {# упражнения}}';

const DEFAULT_LANG = 'es-ES';

const LANG = 'ru-RU';

const scopeOf = (current = {}) => ({
	name: 'puzzle',
	prefixed: true,
	keys: {
		constName: 'PUZZLE_KEYS',
		entries: [{ name: 'IMPORTED', ulid: ULID, value: `puzzle.${ULID}` }],
	},
	translations: new Map([
		[DEFAULT_LANG, { data: { [ULID]: SOURCE } }],
		[LANG, { data: current }],
	]),
});

const documentOf = (units) => ({
	file: 'ru-RU.xlf',
	xliff: {
		srcLang: DEFAULT_LANG,
		trgLang: LANG,
		files: [{ id: 'puzzle', notes: [], units }],
	},
});

function formUnits(targets, ulid = ULID) {
	const forms = formsOf({ source: SOURCE, target: '', lang: LANG, defaultLang: DEFAULT_LANG });

	return forms.map((form) => ({
		id: `puzzle.${ulid}${form.suffix}`,
		notes: [],
		source: form.source,
		target: targets[form.suffix] ?? '',
	}));
}

const planOf = (units, current) =>
	planImport({
		scopes: [scopeOf(current)],
		langs: [DEFAULT_LANG, LANG],
		defaultLang: DEFAULT_LANG,
		documents: [documentOf(units)],
	});

const messages = (plan) => plan.problems.map((item) => item.message);

describe('planImport over a key that fans out', () => {
	test('merges the four Russian forms into one update', () => {
		const plan = planOf(formUnits(RUSSIAN));

		strictEqual(plan.updates.length, 1);
		strictEqual(plan.updates[0].ulid, ULID);
		strictEqual(plan.updates[0].key, 'IMPORTED');
		strictEqual(plan.updates[0].to, REBUILT);
		deepStrictEqual(plan.problems, []);
	});

	test('counts the key once and not once per form', () => {
		const plan = planOf(formUnits(RUSSIAN));

		deepStrictEqual(plan.counts.get(LANG), { updated: 1, unchanged: 0, empty: 0 });
	});

	test('seals the key whole, with the hash of its source', () => {
		const plan = planOf(formUnits(RUSSIAN));

		strictEqual(plan.seals.length, 1);
		strictEqual(plan.seals[0].ulid, ULID);
		strictEqual(plan.seals[0].lang, LANG);
	});

	test('reads the key as unchanged when the rebuilt string is what it already had', () => {
		const plan = planOf(formUnits(RUSSIAN), { [ULID]: REBUILT });

		strictEqual(plan.updates.length, 0);
		deepStrictEqual(plan.counts.get(LANG), { updated: 0, unchanged: 1, empty: 0 });
	});
});

describe('planImport and the incomplete group', () => {
	test('writes nothing for a key one form short', () => {
		const plan = planOf(formUnits({ ...RUSSIAN, '#plural:many': '' }));

		strictEqual(plan.updates.length, 0);
		deepStrictEqual(plan.counts.get(LANG), { updated: 0, unchanged: 0, empty: 1 });
		deepStrictEqual(messages(plan), ['1 of 4 forms came back empty — the key is left untouched']);
	});

	test('leaves the key alone instead of writing an ICU string with a branch missing', () => {
		const plan = planOf(formUnits({ ...RUSSIAN, '#plural:few': '' }), { [ULID]: REBUILT });

		strictEqual(plan.updates.length, 0);
		strictEqual(plan.seals.length, 0);
	});
});

describe('planImport and the key that went out stale', () => {
	const stale = (targets) =>
		formUnits(targets).map((unit) => ({ ...unit, subState: OUTDATED_SUB_STATE }));

	test('leaves a group nobody touched stale instead of sealing it', () => {
		const plan = planOf(stale(RUSSIAN), { [ULID]: REBUILT });

		deepStrictEqual(plan.seals, []);
		strictEqual(plan.outdated.length, 1);
		strictEqual(plan.outdated[0].key, 'IMPORTED');
		deepStrictEqual(plan.counts.get(LANG), { updated: 0, unchanged: 1, empty: 0 });
	});

	test('seals it when the translator kept the words and moved the segment on', () => {
		const units = stale(RUSSIAN).map((unit) => ({ ...unit, subState: null }));
		const plan = planOf(units, { [ULID]: REBUILT });

		strictEqual(plan.seals.length, 1);
		deepStrictEqual(plan.outdated, []);
	});

	test('seals it when the words themselves came back changed', () => {
		const plan = planOf(stale({ ...RUSSIAN, '#plural:one': '# задание' }), { [ULID]: REBUILT });

		strictEqual(plan.updates.length, 1);
		strictEqual(plan.seals.length, 1);
	});
});

describe('planImport and a key keys.ts does not have', () => {
	test('offers a flat key once, the way it always did', () => {
		const unit = {
			id: `puzzle.${NEW_ULID}`,
			notes: [{ category: 'key', text: 'PUZZLE_KEYS.NEW_ONE' }],
			source: 'Hola',
			target: 'Привет',
		};
		const plan = planOf([unit]);

		strictEqual(plan.added.length, 1);
		strictEqual(plan.added[0].name, 'NEW_ONE');
		strictEqual(plan.added[0].ulid, NEW_ULID);
	});

	test('refuses its forms instead of offering the same key four times', () => {
		const plan = planOf(formUnits(RUSSIAN, NEW_ULID));

		strictEqual(plan.added.length, 0);
		deepStrictEqual(messages(plan), [
			'the key is not in keys.ts, so its forms cannot be recomposed',
		]);
	});
});

describe('planImport and the ids it refuses', () => {
	test('names the key and not the form when the id is not a ULID', () => {
		const unit = { id: 'puzzle.NOT_A_ULID#plural:one', notes: [], source: '', target: 'a' };
		const plan = planOf([unit]);

		deepStrictEqual(plan.problems, [{ file: 'puzzle.NOT_A_ULID', message: 'id is not a ULID' }]);
	});

	test('reads a language the catalogue does not have as the problem it is', () => {
		const plan = planImport({
			scopes: [scopeOf()],
			langs: [DEFAULT_LANG],
			defaultLang: DEFAULT_LANG,
			documents: [documentOf(formUnits(RUSSIAN))],
		});

		ok(messages(plan)[0].includes('is not a language here'));
	});
});
