import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import path from 'node:path';
import { after, describe, test } from 'node:test';

import { createCatalogue, removeCatalogues, ulidOf } from './testing/catalogue.mjs';
import { runCli } from './testing/cli.mjs';
import { COMMENTED, IN_A_COMMENT, LANGS, SAVE, STALE, keysOf, read, spanishOf } from './testing/project.mjs';

after(removeCatalogues);

const withUnused = () =>
	createCatalogue({ langs: LANGS, keys: [SAVE, { ...STALE, used: false }, COMMENTED], usages: IN_A_COMMENT });

const stateOf = (catalogue) => read(path.join(catalogue.i18nDir, 'state', 'demo.json'));

const paramsOf = (catalogue) => read(path.join(catalogue.scopeDir, 'params.ts'));

const snapshotOf = (catalogue) => [keysOf(catalogue), spanishOf(catalogue), stateOf(catalogue), paramsOf(catalogue)];

describe('transloco-ulid prune', () => {
	test('lists the keys nothing uses, and keeps the one only a comment mentions', () => {
		const { stdout } = runCli(withUnused().root, ['prune', '--dry-run']);

		ok(stdout.includes('⚠ demo.GREET — Hello {name}'));
		ok(!stdout.includes('demo.KEY'));
	});

	test('writes nothing with --dry-run, and names the files it would write', () => {
		const catalogue = withUnused();
		const before = snapshotOf(catalogue);
		const { status, stdout } = runCli(catalogue.root, ['prune', '--dry-run']);

		strictEqual(status, 0);
		ok(stdout.includes('Files that would be written:'));
		ok(stdout.includes(path.join(catalogue.scopeDir, 'keys.ts')));
		deepStrictEqual(snapshotOf(catalogue), before);
	});

	test('refuses to guess without a terminal to ask in', () => {
		const catalogue = withUnused();
		const before = snapshotOf(catalogue);
		const { status, stderr } = runCli(catalogue.root, ['prune']);

		strictEqual(status, 1);
		ok(stderr.includes('no terminal to ask in — pass --yes to remove them all'));
		deepStrictEqual(snapshotOf(catalogue), before);
	});

	test('removes the key, its translations, its seals and its params with --yes', () => {
		const catalogue = withUnused();
		const { status, stdout } = runCli(catalogue.root, ['prune', '--yes']);
		const gone = ulidOf(1);

		strictEqual(status, 0);
		ok(stdout.includes('✔ 1 key removed'));
		ok(!keysOf(catalogue).includes('GREET'));
		ok(keysOf(catalogue).includes('SAVE') && keysOf(catalogue).includes('KEY'));
		ok(!Object.hasOwn(spanishOf(catalogue), gone));
		ok(!read(path.join(catalogue.scopeDir, 'en-GB.json')).includes(gone));
		ok(!stateOf(catalogue).includes(gone) && stateOf(catalogue).includes(ulidOf(0)));
		ok(!paramsOf(catalogue).includes(gone));
		strictEqual(runCli(catalogue.root, ['check']).status, 0);
	});

	test('only looks in the scopes --scope names, and refuses one it does not have', () => {
		const catalogue = withUnused();
		const unknown = runCli(catalogue.root, ['prune', '--dry-run', '--scope', 'other']);

		strictEqual(unknown.status, 1);
		ok(unknown.stderr.includes('unknown scope(s): other'));
	});

	test('says so when every key is used', () => {
		const catalogue = createCatalogue({ langs: LANGS, keys: [SAVE] });
		const { status, stdout } = runCli(catalogue.root, ['prune']);

		strictEqual(status, 0);
		ok(stdout.includes('✓ Nothing to prune — every key is used'));
	});
});
