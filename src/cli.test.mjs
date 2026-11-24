import { ok, strictEqual } from 'node:assert/strict';
import { after, describe, test } from 'node:test';

import { removeCatalogues } from './testing/catalogue.mjs';
import { runCli } from './testing/cli.mjs';
import { project } from './testing/project.mjs';

after(removeCatalogues);

describe('transloco-ulid', () => {
	test('prints the commands and fails without one', () => {
		const { status, stderr } = runCli(project().root, []);

		strictEqual(status, 1);
		ok(stderr.includes('Usage: transloco-ulid <check|add|export|import|state|clear|notes|prune>'));
	});

	test('prints the help of check, add, export, import and notes', () => {
		const { root } = project();

		for (const command of ['check', 'add', 'export', 'import', 'notes']) {
			const { status, stdout } = runCli(root, [command, '--help']);

			strictEqual(status, 0);
			ok(stdout.startsWith(`Usage: transloco-ulid ${command}`), command);
		}
	});
});
