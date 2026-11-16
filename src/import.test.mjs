import { ok, strictEqual } from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { after, describe, test } from 'node:test';

import { removeCatalogues, ulidOf } from './testing/catalogue.mjs';
import { runCli } from './testing/cli.mjs';
import { DELETE, SAVE, STALE, keysOf, project, spanishOf, translate, xliffOf } from './testing/project.mjs';

after(removeCatalogues);

describe('transloco-ulid import', () => {
	test('sends what is missing out, brings it back, and leaves it fresh', () => {
		const catalogue = project();
		const exported = runCli(catalogue.root, ['export', '--missing']);

		ok(exported.stdout.includes('translations/es-ES.xlf  1 unit · 1 untranslated'));
		translate(catalogue, '<target></target>', '<target>Borrar</target>');

		const dry = runCli(catalogue.root, ['import', '--dry-run']);

		ok(dry.stdout.includes('--dry-run: nothing was written.'));
		strictEqual(spanishOf(catalogue)[ulidOf(1)], '');

		strictEqual(runCli(catalogue.root, ['import']).status, 0);
		strictEqual(spanishOf(catalogue)[ulidOf(1)], 'Borrar');
		ok(runCli(catalogue.root, ['state']).stdout.includes('es-ES  2 fresh · 0 stale · 0 missing'));
		ok(runCli(catalogue.root, ['export', '--missing']).stdout.includes('Nothing to send for es-ES'));
	});

	test('lists what changed and what stays outdated only with --verbose', () => {
		const catalogue = project([SAVE, DELETE, STALE]);

		runCli(catalogue.root, ['export']);
		translate(catalogue, '<target>Guardar</target>', '<target>Salvar</target>');

		const quiet = runCli(catalogue.root, ['import', 'translations/es-ES.xlf', '--dry-run']);
		const verbose = runCli(catalogue.root, ['import', '--verbose', '--dry-run']);

		ok(quiet.stdout.includes('es-ES  1 updated · 1 unchanged · 1 empty'));
		ok(quiet.stdout.includes('1 translation changed — re-run with --verbose to list them'));
		ok(quiet.stdout.includes('⚠ 1 key came back without a fresh translation — left outdated'));
		ok(verbose.stdout.includes('demo.SAVE · es-ES\n    - Guardar\n    + Salvar'));
		ok(verbose.stdout.includes('left outdated\n      demo.GREET · es-ES'));
	});

	test('lists the problems of what it imported', () => {
		const catalogue = project([{ name: 'GREET', texts: { 'en-GB': 'Hello {name}', 'es-ES': '' } }]);

		runCli(catalogue.root, ['export']);
		translate(catalogue, '<target></target>', '<target>Hola</target>');

		const { status, stdout } = runCli(catalogue.root, ['import']);

		strictEqual(status, 0);
		ok(stdout.includes(`✖ demo.${ulidOf(0)}  placeholders differ from en-GB`));
		ok(stdout.includes('1 problem'));
	});

	test('fails on a directory without XLIFF files', () => {
		const { root } = project();

		mkdirSync(path.join(root, 'empty'));

		const { status, stderr } = runCli(root, ['import', 'empty']);

		strictEqual(status, 1);
		ok(stderr.includes('✖ no .xlf files in empty'));
	});

	test('fails on an input that does not exist', () => {
		const { status, stderr } = runCli(project().root, ['import', 'nowhere']);

		strictEqual(status, 1);
		ok(stderr.includes('nowhere does not exist'));
	});

	test('skips the new keys of a file without a terminal to ask in, and adds them with --all-new', () => {
		const catalogue = project();

		runCli(catalogue.root, ['export']);
		translate(catalogue, `demo.${ulidOf(1)}`, `demo.${ulidOf(900)}`);
		translate(catalogue, '<target></target>', '<target>Nuevo</target>');

		ok(runCli(catalogue.root, ['import']).stdout.includes('1 new key skipped — pass --all-new to add them.'));
		ok(!keysOf(catalogue).includes(ulidOf(900)));

		const added = runCli(catalogue.root, ['import', '--all-new']);

		ok(added.stdout.includes('New keys landed in keys.ts'));
		ok(keysOf(catalogue).includes(`\tDELETE_2: 'demo.${ulidOf(900)}',`));
		ok(existsSync(xliffOf(catalogue)));
	});
});
