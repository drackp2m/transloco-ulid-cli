import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GENDER_ARG } from './genders.mjs';
import { DEFAULT_NOTES_LANG } from './note-texts.mjs';

export const CONFIG_FILE = 'i18n.config.json';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

const LANGUAGE_TAG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

export const isLanguageTag = (value) => LANGUAGE_TAG.test(String(value));

const STRING_FIELDS = ['i18nDir', 'languageFile', 'rootScope', 'importAlias', 'xliffPrefix'];

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

export function findConfigFile(from) {
	const dir = path.resolve(from);
	const file = path.join(dir, CONFIG_FILE);

	if (existsSync(file)) {
		return file;
	}

	const parent = path.dirname(dir);

	return parent === dir ? null : findConfigFile(parent);
}

function readConfigFile(file) {
	try {
		return JSON.parse(readFileSync(file, 'utf8'));
	} catch (error) {
		throw new Error(`${file}: ${error instanceof Error ? error.message : String(error)}`, {
			cause: error,
		});
	}
}

function checkConfig(raw, file) {
	const invalid = STRING_FIELDS.filter((field) => 'string' !== typeof raw?.[field] || !raw[field]);
	const sources = raw?.sourceDirs;

	if (
		!Array.isArray(sources) ||
		!sources.length ||
		sources.some((dir) => 'string' !== typeof dir)
	) {
		invalid.push('sourceDirs');
	}

	if (undefined !== raw?.notesLang && !isLanguageTag(raw.notesLang)) {
		invalid.push('notesLang (a language tag such as "es" or "pt-BR")');
	}

	if (invalid.length) {
		throw new Error(`${file}: missing or invalid ${invalid.join(', ')}`);
	}

	return raw;
}

export function loadConfig(from) {
	const file = findConfigFile(from);

	if (null === file) {
		throw new Error(`No ${CONFIG_FILE} in ${path.resolve(from)} or any directory above it`);
	}

	const raw = checkConfig(readConfigFile(file), file);
	const root = path.dirname(file);
	const languageFile = path.resolve(root, raw.languageFile);

	return {
		root,
		i18nDir: path.normalize(raw.i18nDir),
		sourceDirs: raw.sourceDirs.map((dir) => path.normalize(dir)),
		languageFile,
		...readLanguages(languageFile),
		rootScope: raw.rootScope,
		importAlias: raw.importAlias,
		xliffPrefix: raw.xliffPrefix,
		notesLang: raw.notesLang ?? DEFAULT_NOTES_LANG,
	};
}

const configStart = () =>
	null === findConfigFile(process.cwd()) && null !== findConfigFile(MODULE_DIR)
		? MODULE_DIR
		: process.cwd();

let defaults = null;

export function readDefaults() {
	defaults ??= loadConfig(configStart());

	return defaults;
}

export const AMBIENT_PARAMS = new Set([GENDER_ARG]);

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
		...readDefaults(),
		...(value('--dir') ? { i18nDir: value('--dir') } : {}),
		...(value('--source') ? { sourceDirs: value('--source').split(',').filter(Boolean) } : {}),
		...(languageFile ? { languageFile, ...readLanguages(languageFile) } : {}),
		...(langs?.length ? { langs, defaultLang: langs[0] } : {}),
		fix: argv.includes('--fix'),
		verbose: argv.includes('--verbose') || argv.includes('-v'),
	};
}
