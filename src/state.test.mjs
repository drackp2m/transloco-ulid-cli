import { deepStrictEqual, ok } from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { after, describe, test } from 'node:test';

import { removeCatalogues } from './testing/catalogue.mjs';
import { runCli } from './testing/cli.mjs';
import { SAVE, project, withoutScopes } from './testing/project.mjs';

after(removeCatalogues);

describe('transloco-ulid state', () => {
	test('counts each status per language', () => {
		ok(runCli(project().root, ['state']).stdout.includes('es-ES  1 fresh · 0 stale · 1 missing'));
	});

	test('fails without scopes, and on a state file that is not valid JSON', () => {
		const broken = project();

		writeFileSync(path.join(broken.i18nDir, 'state', 'demo.json'), '{ nope');

		const scopeless = runCli(withoutScopes().root, ['state']);
		const invalid = runCli(broken.root, ['state']);

		deepStrictEqual([scopeless.status, invalid.status], [1, 1]);
		ok(scopeless.stderr.includes('✖ no scopes in i18n'));
		ok(invalid.stderr.includes('✖ i18n/state/demo.json: '));
	});

	test('has nothing to write with --adopt when every seal is current', () => {
		ok(runCli(project([SAVE]).root, ['state', '--adopt']).stdout.includes('✓ Nothing to write'));
	});

	test('seals every translation as it is today with --adopt, the stale ones included', () => {
		const catalogue = project([
			{ name: 'SAVE', texts: { 'en-GB': 'Save', 'es-ES': 'Guardar' } },
			{ name: 'GREET', texts: { 'en-GB': 'Hello', 'es-ES': 'Hola' }, seal: 'Hi' },
		]);

		ok(runCli(catalogue.root, ['state']).stdout.includes('es-ES  0 fresh · 1 stale · 0 missing · 1 unknown'));

		const adopted = runCli(catalogue.root, ['state', '--adopt']);

		ok(adopted.stdout.includes('⚠ 1 outdated translation sealed as fresh'));
		ok(runCli(catalogue.root, ['state']).stdout.includes('es-ES  2 fresh · 0 stale · 0 missing'));
	});
});
