import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { after, describe, test } from 'node:test';

import { hashOf } from './catalogue/freshness.mjs';
import { createCatalogue, removeCatalogues, ulidOf } from './testing/catalogue.mjs';
import { runCli } from './testing/cli.mjs';
import { SAVE, project, withoutScopes } from './testing/project.mjs';

after(removeCatalogues);

const THREE_LANGS = ['en-GB', 'es-ES', 'fr-FR'];
const UNSEALED = { name: 'SAVE', texts: { 'en-GB': 'Save', 'es-ES': 'Guardar', 'fr-FR': 'Enregistrer' } };
const SEALED = {
	name: 'GREET',
	texts: { 'en-GB': 'Hello', 'es-ES': 'Hola', 'fr-FR': 'Bonjour' },
	seal: true,
};

const threeLanguages = () => createCatalogue({ langs: THREE_LANGS, keys: [UNSEALED, SEALED] });

const stateOf = ({ i18nDir }) =>
	JSON.parse(readFileSync(path.join(i18nDir, 'state', 'demo.json'), 'utf8'));

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

	test('seals only what --adopt names, and leaves the rest as it was', () => {
		const catalogue = project([
			{ name: 'SAVE', texts: { 'en-GB': 'Save', 'es-ES': 'Guardar' } },
			{ name: 'GREET', texts: { 'en-GB': 'Hello', 'es-ES': 'Hola' }, seal: 'Hi' },
		]);
		const adopted = runCli(catalogue.root, ['state', '--adopt', 'demo.SAVE.es-ES']);

		strictEqual(adopted.status, 0);
		ok(adopted.stdout.includes('es-ES  1 fresh · 1 stale · 0 missing'));
		ok(!adopted.stdout.includes('sealed as fresh'));
	});

	test('fails on a target that names nothing, before writing anything', () => {
		const catalogue = project([{ name: 'SAVE', texts: { 'en-GB': 'Save', 'es-ES': 'Guardar' } }]);
		const adopted = runCli(catalogue.root, ['state', '--adopt', 'demo.SAVE.es-ES,demo.NOPE']);

		strictEqual(adopted.status, 1);
		ok(adopted.stderr.includes('✖ demo.NOPE names a key demo does not have: NOPE'));
		ok(runCli(catalogue.root, ['state']).stdout.includes('es-ES  0 fresh · 0 stale · 0 missing · 1 unknown'));
	});

	test('keeps the seals of the languages --langs leaves out when it seals a target', () => {
		const catalogue = threeLanguages();
		const adopted = runCli(catalogue.root, [
			'state',
			'--adopt',
			'demo.SAVE.es-ES',
			'--langs',
			'en-GB,es-ES',
		]);

		strictEqual(adopted.status, 0);
		deepStrictEqual(stateOf(catalogue), {
			[ulidOf(0)]: { 'es-ES': hashOf('Save') },
			[ulidOf(1)]: { 'es-ES': hashOf('Hello'), 'fr-FR': hashOf('Hello') },
		});
	});

	test('keeps the seals of the languages --langs leaves out when it seals everything', () => {
		const catalogue = threeLanguages();
		const adopted = runCli(catalogue.root, ['state', '--adopt', '--langs', 'en-GB,es-ES']);

		strictEqual(adopted.status, 0);
		deepStrictEqual(stateOf(catalogue), {
			[ulidOf(0)]: { 'es-ES': hashOf('Save') },
			[ulidOf(1)]: { 'es-ES': hashOf('Hello'), 'fr-FR': hashOf('Hello') },
		});
	});

	test('seals a whole scope, and a scope in one language', () => {
		const whole = threeLanguages();
		const french = threeLanguages();
		const greet = { 'es-ES': hashOf('Hello'), 'fr-FR': hashOf('Hello') };

		strictEqual(runCli(whole.root, ['state', '--adopt', 'demo']).status, 0);
		strictEqual(runCli(french.root, ['state', '--adopt', 'demo.fr-FR']).status, 0);
		deepStrictEqual(stateOf(whole), {
			[ulidOf(0)]: { 'es-ES': hashOf('Save'), 'fr-FR': hashOf('Save') },
			[ulidOf(1)]: greet,
		});
		deepStrictEqual(stateOf(french), {
			[ulidOf(0)]: { 'fr-FR': hashOf('Save') },
			[ulidOf(1)]: greet,
		});
	});

	test('refuses an empty translation asked for by its key, and skips it in a wider target', () => {
		const catalogue = project();
		const named = runCli(catalogue.root, ['state', '--adopt', 'demo.DELETE.es-ES']);
		const wide = runCli(catalogue.root, ['state', '--adopt', 'demo']);

		deepStrictEqual([named.status, wide.status], [1, 0]);
		ok(named.stdout.includes('demo.DELETE [es-ES]: has no translation to seal'));
		ok(!wide.stdout.includes('not sealed'));
		ok(wide.stdout.includes('es-ES  1 fresh · 0 stale · 1 missing'));
	});

	test('fails on a target that is not written as one', () => {
		const adopted = runCli(project().root, ['state', '--adopt', 'demo.SAVE.es-ES.more']);

		strictEqual(adopted.status, 1);
		ok(
			adopted.stderr.includes(
				'✖ demo.SAVE.es-ES.more is not scope, scope.KEY, scope.KEY.lang or scope.lang',
			),
		);
	});

	test('does not seal a translation whose parameters do not match, and says why', () => {
		const catalogue = project([
			{ name: 'SAVE', texts: { 'en-GB': 'Save', 'es-ES': 'Guardar' } },
			{ name: 'GREET', texts: { 'en-GB': 'Hello {name}', 'es-ES': 'Hola' } },
		]);
		const whole = runCli(catalogue.root, ['state', '--adopt']);
		const named = runCli(catalogue.root, ['state', '--adopt', 'demo.GREET']);

		deepStrictEqual([whole.status, named.status], [0, 1]);
		ok(whole.stdout.includes('es-ES  1 fresh · 0 stale · 0 missing · 1 unknown'));
		ok(whole.stdout.includes('⚠ 1 translation not sealed:'));
		ok(named.stdout.includes('demo.GREET [es-ES]: demo.GREET has no {name}'));
	});
});
