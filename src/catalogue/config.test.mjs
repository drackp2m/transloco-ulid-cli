import { deepStrictEqual, strictEqual, throws } from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, describe, test } from 'node:test';

import { CONFIG_FILE, findConfigFile, loadConfig } from './config.mjs';

const DIRS = [];

const CONFIG = {
	i18nDir: 'src/app/i18n/',
	sourceDirs: ['src', 'lib/'],
	languageFile: 'src/language.ts',
	rootScope: 'common',
	importAlias: '@demo/i18n',
	xliffPrefix: 'demo',
};

const LANGUAGES = [
	"export const LANGUAGES = ['es-ES', 'en-GB'];",
	"export const DEFAULT_LANGUAGE = 'es-ES';",
].join('\n');

after(() => {
	for (const dir of DIRS) {
		rmSync(dir, { recursive: true, force: true });
	}
});

function project(config) {
	const root = mkdtempSync(path.join(tmpdir(), 'i18n-config-'));
	const nested = path.join(root, 'src', 'app', 'deep');

	DIRS.push(root);
	mkdirSync(nested, { recursive: true });
	writeFileSync(path.join(root, 'src', 'language.ts'), LANGUAGES, 'utf8');

	if (undefined !== config) {
		const content = 'string' === typeof config ? config : JSON.stringify(config);

		writeFileSync(path.join(root, CONFIG_FILE), content, 'utf8');
	}

	return { root, nested };
}

describe('findConfigFile', () => {
	test('walks up from a nested directory to the closest config', () => {
		const { root, nested } = project(CONFIG);

		strictEqual(findConfigFile(nested), path.join(root, CONFIG_FILE));
	});

	test('returns null when no directory above holds one', () => {
		const { nested } = project();

		strictEqual(findConfigFile(nested), null);
	});
});

describe('loadConfig', () => {
	test('resolves the language file from the root and keeps the dirs relative to it', () => {
		const { root, nested } = project(CONFIG);

		deepStrictEqual(loadConfig(nested), {
			root,
			i18nDir: path.normalize('src/app/i18n/'),
			sourceDirs: [path.normalize('src'), path.normalize('lib/')],
			languageFile: path.join(root, 'src', 'language.ts'),
			langs: ['es-ES', 'en-GB'],
			defaultLang: 'es-ES',
			rootScope: 'common',
			importAlias: '@demo/i18n',
			xliffPrefix: 'demo',
			notesLang: 'en',
		});
	});

	test('takes the language of the notes from notesLang', () => {
		const { root } = project({ ...CONFIG, notesLang: 'es' });

		strictEqual(loadConfig(root).notesLang, 'es');
	});

	test('refuses a notes language it has no texts for', () => {
		const { root } = project({ ...CONFIG, notesLang: 'fr' });

		throws(() => loadConfig(root), /missing or invalid notesLang \(one of en, es\)$/);
	});

	test('names every missing or invalid field', () => {
		const { root } = project({ ...CONFIG, importAlias: '', sourceDirs: [], rootScope: 3 });

		throws(() => loadConfig(root), /missing or invalid rootScope, importAlias, sourceDirs$/);
	});

	test('names the file when it is not valid JSON', () => {
		const { root } = project('{ "i18nDir": ');

		throws(
			() => loadConfig(root),
			(error) => error.message.startsWith(path.join(root, CONFIG_FILE)),
		);
	});

	test('fails when there is no config at all', () => {
		const { root } = project();

		throws(() => loadConfig(root), new RegExp(`^Error: No ${CONFIG_FILE.replace('.', '\\.')} in`));
	});
});
