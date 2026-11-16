import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import path from 'node:path';
import { after, describe, test } from 'node:test';

import { removeCatalogues, ulidOf } from './testing/catalogue.mjs';
import { runCli } from './testing/cli.mjs';
import { DELETE, project, read, spanishOf, withoutScopes } from './testing/project.mjs';

after(removeCatalogues);

describe('transloco-ulid clear', () => {
	test('refuses the source language, and a call that names none', () => {
		const { root } = project();
		const source = runCli(root, ['clear', '--lang', 'en-GB']);
		const none = runCli(root, ['clear']);

		deepStrictEqual([source.status, none.status], [1, 1]);
		ok(source.stderr.includes('en-GB is the source language'));
		ok(none.stderr.includes('nothing to clear'));
	});

	test('refuses a language or a scope the catalogue does not have, and an empty catalogue', () => {
		const { root } = project();
		const lang = runCli(root, ['clear', '--lang', 'fr-FR']);
		const scope = runCli(root, ['clear', '--lang', 'es-ES', '--scope', 'other']);
		const scopeless = runCli(withoutScopes().root, ['clear', '--lang', 'es-ES']);

		deepStrictEqual([lang.status, scope.status, scopeless.status], [1, 1, 1]);
		ok(lang.stderr.includes('✖ unknown language(s): fr-FR'));
		ok(scope.stderr.includes('✖ unknown scope(s): other'));
		ok(scopeless.stderr.includes('✖ no scopes in i18n'));
	});

	test('has nothing to clear in a language that is already empty', () => {
		const { stdout } = runCli(project([DELETE]).root, ['clear', '--lang', 'es-ES']);

		ok(stdout.includes('✓ Nothing to clear — every target is already empty'));
	});

	test('lists what it would clear with --dry-run, and writes nothing', () => {
		const catalogue = project();
		const { stdout } = runCli(catalogue.root, ['clear', '--lang', 'es-ES', '--dry-run']);

		ok(stdout.includes('es-ES  demo · 1 cleared'));
		strictEqual(spanishOf(catalogue)[ulidOf(0)], 'Guardar');
	});

	test('empties a language, and drops its seals with --unseal', () => {
		const catalogue = project();

		strictEqual(runCli(catalogue.root, ['clear', '--lang', 'es-ES', '--unseal']).status, 0);
		deepStrictEqual(spanishOf(catalogue), { [ulidOf(0)]: '', [ulidOf(1)]: '' });
		deepStrictEqual(JSON.parse(read(path.join(catalogue.i18nDir, 'state', 'demo.json'))), {});
	});
});
