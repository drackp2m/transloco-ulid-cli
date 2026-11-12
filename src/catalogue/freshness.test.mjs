import { deepStrictEqual } from 'node:assert/strict';
import { after, describe, test } from 'node:test';

import { createCatalogue, removeCatalogues, scopesOf, ulidOf } from '../testing/catalogue.mjs';

import { freshnessIn, readStates, tallyOf } from './freshness.mjs';

after(removeCatalogues);

const LANGS = ['es-ES', 'en-GB', 'fr-FR'];

const KEYS = [
	{ name: 'FRESH', texts: { 'es-ES': 'Guardar', 'en-GB': 'Save', 'fr-FR': '' }, seal: true },
	{ name: 'STALE', texts: { 'es-ES': 'Abrir', 'en-GB': 'Open', 'fr-FR': '' }, seal: 'Abre' },
	{ name: 'UNSEALED', texts: { 'es-ES': 'Cerrar', 'en-GB': 'Close', 'fr-FR': '' } },
];

function entriesOf(catalogue) {
	const scopes = scopesOf(catalogue);
	const states = readStates(catalogue.i18nDir, scopes);

	return freshnessIn(scopes, states, catalogue);
}

describe('freshnessIn', () => {
	test('gives one entry per key and target language, each with its scope', () => {
		const entries = entriesOf(createCatalogue({ langs: LANGS, keys: KEYS }));

		deepStrictEqual(entries, [
			{ scope: 'demo', ulid: ulidOf(0), name: 'FRESH', lang: 'en-GB', status: 'fresh' },
			{ scope: 'demo', ulid: ulidOf(0), name: 'FRESH', lang: 'fr-FR', status: 'missing' },
			{ scope: 'demo', ulid: ulidOf(1), name: 'STALE', lang: 'en-GB', status: 'stale' },
			{ scope: 'demo', ulid: ulidOf(1), name: 'STALE', lang: 'fr-FR', status: 'missing' },
			{ scope: 'demo', ulid: ulidOf(2), name: 'UNSEALED', lang: 'en-GB', status: 'unknown' },
			{ scope: 'demo', ulid: ulidOf(2), name: 'UNSEALED', lang: 'fr-FR', status: 'missing' },
		]);
	});
});

describe('tallyOf', () => {
	test('counts each state per target language, the source language aside', () => {
		const catalogue = createCatalogue({ langs: LANGS, keys: KEYS });

		deepStrictEqual(
			[...tallyOf(entriesOf(catalogue), catalogue)],
			[
				['en-GB', { fresh: 1, stale: 1, missing: 0, unknown: 1 }],
				['fr-FR', { fresh: 0, stale: 0, missing: 3, unknown: 0 }],
			],
		);
	});

	test('lists a language with nothing to count, all at zero', () => {
		deepStrictEqual(
			[...tallyOf([], { langs: ['es-ES', 'en-GB'], defaultLang: 'es-ES' })],
			[['en-GB', { fresh: 0, stale: 0, missing: 0, unknown: 0 }]],
		);
	});
});
