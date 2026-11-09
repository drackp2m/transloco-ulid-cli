import { deepStrictEqual } from 'node:assert/strict';
import { after, describe, test } from 'node:test';

import { createCatalogue, removeCatalogues } from '../testing/catalogue.mjs';

import { readContext } from './context.mjs';

const KEYS = [
	{ name: 'SAVE', texts: { 'en-GB': 'Save', 'es-ES': 'Guardar' } },
	{ name: 'LOAD', texts: { 'en-GB': 'Load', 'es-ES': 'Cargar' } },
];

after(removeCatalogues);

const keyContextOf = (scope, name) => {
	const catalogue = createCatalogue({ langs: ['en-GB', 'es-ES'], keys: KEYS, context: { scope } });

	return readContext(catalogue)
		.contextFor('demo', name, 'es-ES')
		.filter((layer) => 'key' === layer.level)
		.map((layer) => layer.text);
};

describe('readContext', () => {
	test('gives headings stacked with nothing between them the paragraph below them all', () => {
		const scope = '# demo\n\nThe demo.\n\n## SAVE\n\n## LOAD\n\nThe two buttons of the form.\n';

		deepStrictEqual(keyContextOf(scope, 'SAVE'), ['The two buttons of the form.']);
		deepStrictEqual(keyContextOf(scope, 'LOAD'), ['The two buttons of the form.']);
	});
});
