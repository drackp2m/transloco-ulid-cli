import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import { describe, test } from 'node:test';

import { parseTranslation } from './collect.mjs';

describe('parseTranslation', () => {
	test('reads a catalogue file from its text, as it would from disk', () => {
		const text = '{\n\t"01J9ZQ4W7K2M6X8Y0B3C5D7E9F": "Guardar"\n}\n';

		deepStrictEqual(parseTranslation(text), {
			exists: true,
			data: { '01J9ZQ4W7K2M6X8Y0B3C5D7E9F': 'Guardar' },
			error: null,
			text,
		});
	});

	test('reports a half-typed file as an error instead of throwing', () => {
		const result = parseTranslation('{\n\t"01J9ZQ4W7K2M6X8Y0B3C5D7E9F": "Guar');

		strictEqual(result.data, null);
		strictEqual('string', typeof result.error);
	});
});
