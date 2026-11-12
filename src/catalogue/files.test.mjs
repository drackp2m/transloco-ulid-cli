import { deepStrictEqual, strictEqual, throws } from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, describe, test } from 'node:test';

import { fileExists, readText, withTexts } from './files.mjs';

const DIR = mkdtempSync(path.join(tmpdir(), 'i18n-files-'));
const SAVED = path.join(DIR, 'saved.json');
const NEW = path.join(DIR, 'new.json');

writeFileSync(SAVED, 'on disk', 'utf8');

after(() => rmSync(DIR, { recursive: true, force: true }));

describe('readText and fileExists', () => {
	test('read the disk when nobody hands a text over', () => {
		strictEqual(readText(SAVED), 'on disk');
		strictEqual(fileExists(SAVED), true);
		strictEqual(fileExists(NEW), false);
		throws(() => readText(NEW), /ENOENT/);
	});
});

describe('withTexts', () => {
	test('answers with the text it was given instead of the disk, while it runs', () => {
		const seen = withTexts(new Map([[SAVED, 'unsaved']]), () => readText(SAVED));

		strictEqual(seen, 'unsaved');
		strictEqual(readText(SAVED), 'on disk');
	});

	test('takes a file that only exists in an editor for one that is there', () => {
		const seen = withTexts(new Map([[NEW, '{}']]), () => [fileExists(NEW), readText(NEW)]);

		deepStrictEqual(seen, [true, '{}']);
		strictEqual(fileExists(NEW), false);
	});

	test('finds a text whatever way its path was written', () => {
		const relative = path.relative(process.cwd(), SAVED);
		const seen = withTexts(new Map([[relative, 'unsaved']]), () =>
			readText(path.join(DIR, '.', 'saved.json')),
		);

		strictEqual(seen, 'unsaved');
	});

	test('keeps an empty text as the text it is', () => {
		strictEqual(
			withTexts(new Map([[SAVED, '']]), () => readText(SAVED)),
			'',
		);
	});

	test('puts the disk back when what it runs throws', () => {
		throws(
			() =>
				withTexts(new Map([[SAVED, 'unsaved']]), () => {
					throw new Error('stop');
				}),
			/stop/,
		);
		strictEqual(readText(SAVED), 'on disk');
	});

	test('nests, and gives the outer texts back when the inner run ends', () => {
		const seen = withTexts(new Map([[SAVED, 'outer']]), () => [
			withTexts(new Map([[SAVED, 'inner']]), () => readText(SAVED)),
			readText(SAVED),
		]);

		deepStrictEqual(seen, ['inner', 'outer']);
	});
});
