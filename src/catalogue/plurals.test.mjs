import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { describe, test } from 'node:test';

import { cardinalCategoriesOf, pluralExamplesOf, requiredCategoriesOf } from './plurals.mjs';

const selectedBelow = (lang, limit) => {
	const rules = new Intl.PluralRules(lang);
	const selected = new Set();

	for (let count = 0; count <= limit; count += 1) {
		selected.add(rules.select(count));
	}

	return [...selected].sort();
};

describe('cardinalCategoriesOf', () => {
	test('gives Spanish every form CLDR declares, "many" included', () => {
		deepStrictEqual(cardinalCategoriesOf('es-ES'), ['one', 'many', 'other']);
	});

	test('gives Russian its four forms', () => {
		deepStrictEqual(cardinalCategoriesOf('ru-RU'), ['one', 'few', 'many', 'other']);
	});

	test('gives Indonesian the single form it has', () => {
		deepStrictEqual(cardinalCategoriesOf('id-ID'), ['other']);
	});

	test('answers nothing for a tag CLDR does not know', () => {
		strictEqual(cardinalCategoriesOf('zz-ZZ'), null);
	});
});

describe('requiredCategoriesOf', () => {
	test('leaves "many" out of Spanish, where no plain count ever selects it', () => {
		deepStrictEqual(requiredCategoriesOf('es-ES'), ['one', 'other']);
	});

	test('keeps "other" in Russian even though no integer selects it', () => {
		deepStrictEqual(requiredCategoriesOf('ru-RU'), ['one', 'few', 'many', 'other']);
		deepStrictEqual(selectedBelow('ru-RU', 1000), ['few', 'many', 'one']);
	});

	test('asks Indonesian for the single form it has', () => {
		deepStrictEqual(requiredCategoriesOf('id-ID'), ['other']);
	});

	test('answers nothing for a tag CLDR does not know', () => {
		strictEqual(requiredCategoriesOf('zz-ZZ'), null);
	});
});

describe('the countable limit', () => {
	test('reaches nothing but "one" and "other" in Spanish', () => {
		deepStrictEqual(selectedBelow('es-ES', 1000), ['one', 'other']);
	});

	test('would start asking Spanish for "many" if it ever reached a million', () => {
		strictEqual(new Intl.PluralRules('es-ES').select(1_000_000), 'many');
		ok(cardinalCategoriesOf('es-ES').includes('many'));
		ok(!requiredCategoriesOf('es-ES').includes('many'));
	});
});

describe('pluralExamplesOf', () => {
	test('gives the numbers a translator needs to picture the category', () => {
		deepStrictEqual(pluralExamplesOf('ru-RU', 'few').integers, [2, 3, 4, 22, 23]);
		deepStrictEqual(pluralExamplesOf('en-GB', 'one').integers, [1]);
	});

	test('says whether the list it hands back is cut short', () => {
		strictEqual(pluralExamplesOf('en-GB', 'one').more, false);
		strictEqual(pluralExamplesOf('en-GB', 'other').more, true);
	});

	test('finds the decimals of a category no integer selects', () => {
		const found = pluralExamplesOf('ru-RU', 'other');

		deepStrictEqual(found.integers, []);
		deepStrictEqual(found.decimals, [0.5, 1.5, 2.5]);
	});

	test('answers nothing for a tag CLDR does not know', () => {
		strictEqual(pluralExamplesOf('zz-ZZ', 'other'), null);
	});
});
