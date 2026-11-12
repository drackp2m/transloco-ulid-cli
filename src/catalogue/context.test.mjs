import { deepStrictEqual } from 'node:assert/strict';
import { after, describe, test } from 'node:test';

import { createCatalogue, removeCatalogues } from '../testing/catalogue.mjs';

import { readContext } from './context.mjs';

const KEYS = [
	{ name: 'SAVE', texts: { 'en-GB': 'Save', 'es-ES': 'Guardar' } },
	{ name: 'LOAD', texts: { 'en-GB': 'Load', 'es-ES': 'Cargar' } },
];

after(removeCatalogues);

const contextOf = ({ scope, app }) =>
	readContext(createCatalogue({ langs: ['en-GB', 'es-ES'], keys: KEYS, context: { scope, app } }));

const layersOf = (scope, name) =>
	contextOf({ scope })
		.contextFor('demo', name, 'es-ES')
		.filter((layer) => 'key' === layer.level || 'group' === layer.level)
		.map(({ level, text }) => `${level}: ${text}`);

describe('readContext', () => {
	test('gives every key of a heading that lists them the paragraph below it', () => {
		const scope = '# demo\n\nThe demo.\n\n## SAVE, LOAD\n\nThe two buttons of the form.\n';

		deepStrictEqual(layersOf(scope, 'SAVE'), ['key: The two buttons of the form.']);
		deepStrictEqual(layersOf(scope, 'LOAD'), ['key: The two buttons of the form.']);
	});

	test('leaves a heading with nothing under it without text, stacked or not', () => {
		const scope = '# demo\n\n## SAVE\n\n## LOAD\n\nLoads the game.\n';

		deepStrictEqual(layersOf(scope, 'SAVE'), []);
		deepStrictEqual(layersOf(scope, 'LOAD'), ['key: Loads the game.']);
	});

	test('reads a list that mixes a pattern and a name by what matched each key', () => {
		const scope = '# demo\n\n## S*, LOAD\n\nShared.\n\n## SAVE\n\nOnly SAVE.\n';

		deepStrictEqual(layersOf(scope, 'SAVE'), ['group: Shared.', 'key: Only SAVE.']);
		deepStrictEqual(layersOf(scope, 'LOAD'), ['key: Shared.']);
	});

	test('gives each language of a list in app.md the same section', () => {
		const context = contextOf({ app: '# App\n\nA trainer.\n\n## es-ES, en-GB\n\nTutea.\n' });

		deepStrictEqual(
			['es-ES', 'en-GB', 'fr-FR'].map((lang) => context.languages.get(lang)),
			['Tutea.', 'Tutea.', undefined],
		);
	});

	test('keeps the column of each name, for the findings that point at one', () => {
		const scope = '# demo\n\n##  SAVE ,LOAD,  , X_*\n\nText.\n';
		const [section] = contextOf({ scope }).scopes.get('demo').sections;

		deepStrictEqual(section.names, [
			{ name: 'SAVE', col: 5 },
			{ name: 'LOAD', col: 11 },
			{ name: 'X_*', col: 20 },
		]);
	});
});
