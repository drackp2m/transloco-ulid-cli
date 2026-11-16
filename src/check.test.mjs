import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { after, describe, test } from 'node:test';

import { createCatalogue, removeCatalogues, ulidOf } from './testing/catalogue.mjs';
import { runCli } from './testing/cli.mjs';
import { COMMENTED, DELETE, IN_A_COMMENT, LANGS, SAVE, project, read, spanishOf, withoutScopes } from './testing/project.mjs';

after(removeCatalogues);

describe('transloco-ulid check', () => {
	test('passes with warnings, and lists them only with --verbose', () => {
		const { root } = project();
		const quiet = runCli(root, ['check']);
		const verbose = runCli(root, ['check', '--verbose']);

		deepStrictEqual([quiet.status, verbose.status], [0, 0]);
		ok(quiet.stdout.includes('1 warning hidden — re-run with --verbose to list them'));
		ok(verbose.stdout.includes(`demo.DELETE is empty  empty-translation`));
	});

	test('fails on an error, and says --fix can solve it', () => {
		const catalogue = project([SAVE, { ...DELETE, texts: { 'en-GB': 'Delete', 'es-ES': null } }]);
		const { status, stdout } = runCli(catalogue.root, ['check']);

		strictEqual(status, 1);
		ok(stdout.includes('has no es-ES translation  missing-translation'));
		ok(stdout.includes('1 problem potentially fixable with the --fix option.'));
	});

	test('fails on a key rendered without the pipe, and points at it in the template', () => {
		const catalogue = createCatalogue({ langs: LANGS, keys: [SAVE], usages: '<p>{{ I18n.demo.SAVE }}</p>' });
		const { status, stdout } = runCli(catalogue.root, ['check']);

		strictEqual(status, 1);
		ok(stdout.includes(path.join(catalogue.sourceDir, 'page.html')));
		ok(stdout.includes('2:7'));
		ok(stdout.includes('demo.SAVE is interpolated without "| i18n", so the key itself is what renders'));
	});

	test('fixes what it can with --fix, and then passes', () => {
		const catalogue = project([SAVE, { ...DELETE, texts: { 'en-GB': 'Delete', 'es-ES': null } }]);
		const { status, stdout } = runCli(catalogue.root, ['check', '--fix']);

		strictEqual(status, 0);
		ok(stdout.includes('✔ 1 file updated'));
		strictEqual(spanishOf(catalogue)[ulidOf(1)], '');
	});

	test('says so when every key is fine, and that --fix had nothing to write', () => {
		const { root } = project([SAVE]);

		ok(runCli(root, ['check']).stdout.includes('✔ Every key is declared, translated and used.'));
		ok(runCli(root, ['check', '--fix']).stdout.includes('✓ Nothing to write'));
	});

	test('counts the notes as hidden, and prints them with --verbose', () => {
		const catalogue = createCatalogue({ langs: LANGS, keys: [SAVE, COMMENTED], usages: IN_A_COMMENT });
		const quiet = runCli(catalogue.root, ['check']);
		const verbose = runCli(catalogue.root, ['check', '--verbose']);

		deepStrictEqual([quiet.status, verbose.status], [0, 0]);
		ok(quiet.stdout.includes('1 note hidden — re-run with --verbose to list them'));
		ok(verbose.stdout.includes('━━ Info ━━'));
		ok(verbose.stdout.includes('3:2  info  demo.KEY is only used in a comment  commented-usage'));
		ok(verbose.stdout.includes('ℹ 1 note'));
	});

	test('skips a catalogue without scopes, in the log and in the job summary', () => {
		const { root } = withoutScopes();
		const summary = path.join(root, 'summary.md');

		writeFileSync(summary, '');

		const { status, stdout } = runCli(root, ['check'], { GITHUB_STEP_SUMMARY: summary });

		strictEqual(status, 0);
		ok(stdout.includes('⊘ skipped — no scopes in i18n'));
		ok(read(summary).includes('> ⊘ Skipped — no scopes in `i18n`.'));
	});

	test('writes its report into the GitHub job summary', () => {
		const { root } = project();
		const summary = path.join(root, 'summary.md');

		writeFileSync(summary, '');
		runCli(root, ['check'], { GITHUB_STEP_SUMMARY: summary });

		const report = read(summary);

		ok(report.startsWith('## i18n Report'));
		ok(report.includes('| `empty-translation` | 0 | 1 |'));
	});

	test('gives the job summary the verdict on errors, what --fix can do and the notes', () => {
		const missing = { ...COMMENTED, texts: { 'en-GB': 'Key', 'es-ES': null } };
		const catalogue = createCatalogue({
			langs: LANGS,
			keys: [SAVE, DELETE, missing],
			usages: IN_A_COMMENT,
		});
		const summary = path.join(catalogue.root, 'summary.md');

		writeFileSync(summary, '');

		strictEqual(runCli(catalogue.root, ['check'], { GITHUB_STEP_SUMMARY: summary }).status, 1);

		const report = read(summary);

		ok(report.includes('| `missing-translation` | 1 | 0 |\n| `empty-translation` | 0 | 1 |'));
		ok(report.includes('> ❌ 1 error · 1 warning.'));
		ok(report.includes('_1 problem potentially fixable with the `--fix` option._'));
		ok(report.includes('_1 note printed in the step log._'));
	});
});
