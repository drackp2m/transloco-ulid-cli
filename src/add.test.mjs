import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { after, describe, test } from 'node:test';

import { removeCatalogues } from './testing/catalogue.mjs';
import { runCli } from './testing/cli.mjs';
import { keysOf, project } from './testing/project.mjs';

after(removeCatalogues);

describe('transloco-ulid add', () => {
	test('adds a key and names its reference', () => {
		const catalogue = project();
		const { status, stdout } = runCli(catalogue.root, [
			'add',
			'--scope',
			'demo',
			'--name',
			'GREET',
			'--text',
			'Hello {name}',
		]);

		strictEqual(status, 0);
		ok(stdout.includes('✔ I18n.demo.GREET added'));
		ok(keysOf(catalogue).includes('\tGREET: '));
	});

	test('writes nothing with --dry-run', () => {
		const catalogue = project();
		const before = keysOf(catalogue);
		const { stdout } = runCli(catalogue.root, ['add', '--scope', 'demo', '--name', 'DRY', '--text', 'Dry', '--dry-run']);

		ok(stdout.includes('drop --dry-run to write.'));
		strictEqual(keysOf(catalogue), before);
	});

	test('refuses a name the scope already has', () => {
		const { status, stderr } = runCli(project().root, ['add', '--scope', 'demo', '--name', 'SAVE', '--text', 'Save']);

		strictEqual(status, 1);
		ok(stderr.includes('✖ demo.SAVE already exists'));
	});

	test('refuses a plural without every form the source language needs', () => {
		const { status, stderr } = runCli(project().root, [
			'add',
			'--scope',
			'demo',
			'--name',
			'CHALLENGES',
			'--plural',
			'count',
			'--one',
			'# challenge',
		]);

		strictEqual(status, 1);
		ok(stderr.includes('"en-GB" needs the forms one, other: missing other'));
	});

	test('refuses a form given without --plural, and a scope that does not exist', () => {
		const { root } = project();

		ok(runCli(root, ['add', '--scope', 'demo', '--name', 'X', '--one', 'x']).stderr.includes('--one goes only with --plural <param>'));
		ok(runCli(root, ['add', '--name', 'X', '--text', 'x']).stderr.includes('unknown scope "common" — the scopes are demo'));
	});

	test('asks for a name, and for either --text or --plural', () => {
		const { root } = project();
		const nameless = runCli(root, ['add', '--scope', 'demo', '--text', 'x']);
		const both = runCli(root, ['add', '--scope', 'demo', '--name', 'X', '--text', 'x', '--plural', 'count']);

		deepStrictEqual([nameless.status, both.status], [1, 1]);
		ok(nameless.stderr.includes('✖ name the key with --name <NAME>'));
		ok(both.stderr.includes('✖ give --text or --plural, not both'));
	});

	test('warns about a form that names another param instead of counting', () => {
		const { stdout } = runCli(project().root, [
			'add',
			'--scope',
			'demo',
			'--name',
			'CHALLENGES',
			'--plural',
			'count',
			'--one',
			'{total} challenge',
			'--other',
			'{total} challenges',
		]);

		ok(stdout.includes('⚠ "one": {total} is not the plural param {count}: write # for the number'));
	});
});
