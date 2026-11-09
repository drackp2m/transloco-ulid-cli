import { ok, strictEqual } from 'node:assert/strict';
import { describe, test } from 'node:test';

import { isUlid } from './config.mjs';
import { newUlid } from './ulid.mjs';

const ZEROS = new Uint8Array(16);

describe('newUlid', () => {
	test('is a ULID the catalogue accepts', () => {
		ok(isUlid(newUlid()));
	});

	test('encodes the time the way the ULID spec does', () => {
		strictEqual(newUlid(1469918176385, ZEROS).slice(0, 10), '01ARYZ6S41');
	});

	test('puts the time first, so a key added later sorts after', () => {
		ok(newUlid(1000, ZEROS) < newUlid(2000, ZEROS));
	});

	test('spends one character of the alphabet on each random byte', () => {
		const bytes = Uint8Array.from({ length: 16 }, (_, index) => index * 2);

		strictEqual(newUlid(0, bytes), '000000000002468ACEGJMPRTWY');
	});
});
