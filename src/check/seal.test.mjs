import { deepStrictEqual, throws } from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { after, describe, test } from 'node:test';

import { hashOf } from '../catalogue/freshness.mjs';
import { createCatalogue, removeCatalogues, scopesOf, ulidOf } from '../testing/catalogue.mjs';

import { applySeal, parseTarget, planSeal } from './seal.mjs';

after(removeCatalogues);

const LANGS = ['en-GB', 'es-ES', 'fr-FR'];
const SAVE = { name: 'SAVE', texts: { 'en-GB': 'Save', 'es-ES': 'Guardar', 'fr-FR': 'Enregistrer' } };
const GREET = {
	name: 'GREET',
	texts: { 'en-GB': 'Hello {name}', 'es-ES': 'Hola {name}', 'fr-FR': 'Bonjour' },
	seal: 'Hi {name}',
};
const EMPTY = { name: 'EMPTY', texts: { 'en-GB': 'Delete', 'es-ES': '', 'fr-FR': 'Supprimer' } };
const BROKEN = { name: 'BROKEN', texts: { 'en-GB': 'Open', 'es-ES': 'Abrir {name', 'fr-FR': 'Ouvrir' } };
const COUNTED = '{count, plural, one {# item} other {# items}}';
const NO_ONE = { name: 'NO_ONE', texts: { 'en-GB': COUNTED, 'es-ES': '{count, plural, other {# cosas}}' } };
const EXTRA = { name: 'EXTRA', texts: { 'en-GB': 'Open', 'es-ES': 'Abrir {name}' } };
const RETYPED = {
	name: 'RETYPED',
	texts: { 'en-GB': '{count} items', 'es-ES': '{count, plural, one {# cosa} other {# cosas}}' },
};

function optionsOf(keys) {
	const catalogue = createCatalogue({ langs: LANGS, keys });

	return { ...catalogue, scopes: scopesOf(catalogue) };
}

const placesOf = (items) => items.map(({ name, lang }) => `${name}.${lang}`);

const stateOf = ({ i18nDir }) =>
	JSON.parse(readFileSync(path.join(i18nDir, 'state', 'demo.json'), 'utf8'));

describe('parseTarget', () => {
	test('reads a scope, a key, a key in a language and a scope in a language', () => {
		deepStrictEqual(
			['demo', 'demo.SAVE', 'demo.SAVE.es-ES', 'demo.es-ES'].map((text) => parseTarget(text, LANGS)),
			[
				{ scope: 'demo' },
				{ scope: 'demo', key: 'SAVE' },
				{ scope: 'demo', key: 'SAVE', lang: 'es-ES' },
				{ scope: 'demo', lang: 'es-ES' },
			],
		);
	});

	test('refuses what has an empty part or too many', () => {
		deepStrictEqual(
			['', 'demo.', 'demo..es-ES', 'demo.SAVE.es-ES.more'].map((text) => parseTarget(text, LANGS)),
			[null, null, null, null],
		);
	});
});

describe('planSeal', () => {
	test('covers every non-empty translation when no target is given', () => {
		const plan = planSeal(optionsOf([SAVE, EMPTY]));

		deepStrictEqual(placesOf(plan.seals), ['SAVE.es-ES', 'SAVE.fr-FR', 'EMPTY.fr-FR']);
		deepStrictEqual([plan.refused, plan.unknown], [[], []]);
	});

	test('narrows to a scope in a language, a key and a key in a language, once each', () => {
		const options = optionsOf([SAVE, EMPTY]);
		const places = (targets) => placesOf(planSeal(options, targets).seals);

		deepStrictEqual(places(['demo.fr-FR']), ['SAVE.fr-FR', 'EMPTY.fr-FR']);
		deepStrictEqual(places(['demo.SAVE']), ['SAVE.es-ES', 'SAVE.fr-FR']);
		deepStrictEqual(places([`demo.${ulidOf(0)}.es-ES`, 'demo.SAVE.es-ES']), ['SAVE.es-ES']);
		deepStrictEqual(places([{ scope: 'demo', key: ulidOf(0), lang: 'fr-FR' }]), ['SAVE.fr-FR']);
	});

	test('seals against the source as it is today', () => {
		const [seal] = planSeal(optionsOf([SAVE]), ['demo.SAVE.es-ES']).seals;

		deepStrictEqual(seal, {
			scope: 'demo',
			name: 'SAVE',
			ulid: ulidOf(0),
			lang: 'es-ES',
			hash: hashOf('Save'),
		});
	});

	test('refuses an empty translation only when its key was asked for', () => {
		const options = optionsOf([SAVE, EMPTY]);

		deepStrictEqual(planSeal(options, ['demo.es-ES']).refused, []);
		deepStrictEqual(planSeal(options, ['demo.EMPTY.es-ES']).refused, [
			{
				scope: 'demo',
				name: 'EMPTY',
				ulid: ulidOf(1),
				lang: 'es-ES',
				reasons: ['has no translation to seal'],
			},
		]);
	});

	test('refuses a translation that drops a parameter, stale or not, and one that is not valid ICU', () => {
		const plan = planSeal(optionsOf([GREET, BROKEN]));

		deepStrictEqual(placesOf(plan.seals), ['GREET.es-ES', 'BROKEN.fr-FR']);
		deepStrictEqual(placesOf(plan.refused), ['GREET.fr-FR', 'BROKEN.es-ES']);
		deepStrictEqual(plan.refused[0].reasons, ['demo.GREET has no {name}']);
	});

	test('refuses a plural without a form the language needs, a parameter added and one retyped', () => {
		const plan = planSeal(optionsOf([NO_ONE, EXTRA, RETYPED, SAVE]), ['demo.es-ES']);

		deepStrictEqual(placesOf(plan.seals), ['SAVE.es-ES']);
		deepStrictEqual(
			plan.refused.map(({ reasons }) => reasons),
			[
				['demo.NO_ONE {count} has no "one" branch, which "es-ES" needs'],
				['demo.EXTRA has an extra {name}'],
				['demo.RETYPED uses {count} as a plural, not as a plain value'],
			],
		);
	});

	test('names every target that points at nothing', () => {
		const targets = ['nope', 'demo.NOPE', 'demo.SAVE.en-GB', 'demo.SAVE.de-DE', 'a.b.c.d'];
		const plan = planSeal(optionsOf([SAVE]), targets);

		deepStrictEqual(
			plan.unknown.map(({ target }) => target),
			targets,
		);
		deepStrictEqual(plan.seals, []);
	});
});

describe('applySeal', () => {
	test('writes the seals next to the ones that were there, and says which files changed', () => {
		const options = optionsOf([SAVE, GREET]);
		const written = applySeal(options, planSeal(options, ['demo.SAVE.es-ES']));

		deepStrictEqual(written, [path.join(options.i18nDir, 'state', 'demo.json')]);
		deepStrictEqual(stateOf(options), {
			[ulidOf(0)]: { 'es-ES': hashOf('Save') },
			[ulidOf(1)]: { 'es-ES': hashOf('Hi {name}'), 'fr-FR': hashOf('Hi {name}') },
		});
		deepStrictEqual(applySeal(options, planSeal(options, ['demo.SAVE.es-ES'])), []);
	});

	test('stops before writing when the state file does not parse', () => {
		const options = optionsOf([SAVE]);

		writeFileSync(path.join(options.i18nDir, 'state', 'demo.json'), '{ nope');

		throws(() => applySeal(options, planSeal(options)), /demo\.json: /);
	});
});
