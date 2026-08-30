import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..', '..', '..', '..');
const LANGUAGE_FILE = path.join(
	ROOT,
	'apps',
	'web',
	'src',
	'app',
	'definition',
	'language.type.ts',
);

export function readLanguages(file) {
	const source = readFileSync(file, 'utf8');
	const list = /const LANGUAGES[^=]*=\s*\[([^\]]*)\]/.exec(source)?.[1] ?? '';
	const langs = [...list.matchAll(/'([^']+)'/g)].map(([, lang]) => lang);
	const defaultLang = /const DEFAULT_LANGUAGE[^=]*=\s*'([^']+)'/.exec(source)?.[1];

	if (!langs.length || undefined === defaultLang) {
		throw new Error(`Could not read LANGUAGES / DEFAULT_LANGUAGE from ${file}`);
	}

	return { langs, defaultLang };
}

export const DEFAULTS = {
	i18nDir: path.join('apps', 'web', 'src', 'app', 'i18n'),
	sourceDirs: [path.join('apps', 'web', 'src')],
	languageFile: LANGUAGE_FILE,
	...readLanguages(LANGUAGE_FILE),
	rootScope: 'common',
};

// Directories under i18n/ that are not scopes: the hand-written context that
// feeds the translator, and the generated freshness state.
export const RESERVED_DIRS = new Set(['context', 'state']);

const ULID_PATTERN = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

export const isUlid = (value) => ULID_PATTERN.test(value);

export const toPascalCase = (name) =>
	name.replace(/(^|-)([a-z0-9])/g, (_match, _separator, char) => char.toUpperCase());

export const toKebabCase = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

export function valueOf(argv, flag) {
	const index = argv.indexOf(flag);

	return -1 === index ? null : (argv[index + 1] ?? null);
}

export const listOf = (argv, flag) => valueOf(argv, flag)?.split(',').filter(Boolean) ?? null;

export function parseArgs(argv) {
	const value = (flag) => valueOf(argv, flag);

	const langs = value('--langs')?.split(',').filter(Boolean);
	const languageFile = value('--languages');

	return {
		...DEFAULTS,
		...(value('--dir') ? { i18nDir: value('--dir') } : {}),
		...(value('--source') ? { sourceDirs: value('--source').split(',').filter(Boolean) } : {}),
		...(languageFile ? { languageFile, ...readLanguages(languageFile) } : {}),
		...(langs?.length ? { langs, defaultLang: langs[0] } : {}),
		fix: argv.includes('--fix'),
		verbose: argv.includes('--verbose') || argv.includes('-v'),
	};
}
