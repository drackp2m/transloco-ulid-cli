import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { collectUsages, readScopes } from '../catalogue/collect.mjs';
import { toPascalCase } from '../catalogue/config.mjs';
import { hashOf } from '../catalogue/freshness.mjs';
import { buildScopeParams, paramsName } from '../catalogue/params.mjs';
import { severityOf } from '../check/findings.mjs';
import { buildFindings } from '../check/rules.mjs';

export const ROOT_SCOPE = 'common';

export const XLIFF_PREFIX = 'test';

export const PIPE = 'i18n';

export const SPANISH_NOTES = JSON.parse(
	readFileSync(new URL('./notes.es.json', import.meta.url), 'utf8'),
);

const DIRS = [];

export const ulidOf = (index) => `01KZJ895M8N6WQ02RVEABRE${String(index).padStart(3, '0')}`;

const json = (data) => `${JSON.stringify(data, null, '\t')}\n`;

function write(file, content) {
	mkdirSync(path.dirname(file), { recursive: true });
	writeFileSync(file, content, 'utf8');
}

function barrelOf(scopeName) {
	const constName = `${toPascalCase(scopeName)}I18n`;
	const property = ROOT_SCOPE === scopeName ? 'common' : scopeName;
	const from = ROOT_SCOPE === scopeName ? '@app/i18n' : `@app/i18n/${scopeName}`;

	return [
		`import { ${constName} } from '${from}/keys';`,
		`import type { ${paramsName(scopeName)} } from '${from}/params';`,
		'',
		`export const I18n = {`,
		`\t${property}: ${constName},`,
		'} as const;',
		'',
		`export type I18nParams = ${paramsName(scopeName)};`,
		'',
	].join('\n');
}

function keysOf(scopeName, keys) {
	const prefix = ROOT_SCOPE === scopeName ? '' : `${scopeName}.`;
	const lines = keys.map(({ name, ulid }) => `\t${name}: '${prefix}${ulid}',`);

	return [`export const ${toPascalCase(scopeName)}I18n = {`, ...lines, '} as const;', ''].join(
		'\n',
	);
}

function translationOf(keys, lang) {
	const entries = keys
		.filter(({ texts }) => null !== texts[lang])
		.map(({ ulid, texts }) => [ulid, texts[lang] ?? '']);

	return json(Object.fromEntries(entries));
}

function sealsOf(keys, langs, defaultLang) {
	const sealed = keys.filter(({ seal }) => undefined !== seal);
	const targets = langs.filter((lang) => lang !== defaultLang);

	return Object.fromEntries(
		sealed.map(({ ulid, texts, seal }) => {
			const source = true === seal ? texts[defaultLang] : seal;

			return [ulid, Object.fromEntries(targets.map((lang) => [lang, hashOf(source)]))];
		}),
	);
}

function usagesOf(scopeName, keys, extra) {
	const property = ROOT_SCOPE === scopeName ? 'common' : scopeName;
	const lines = keys
		.filter(({ used }) => false !== used)
		.map(({ name }) => `<p>{{ I18n.${property}.${name} | ${PIPE} }}</p>`);

	return [...lines, extra, ''].join('\n');
}

function projectFiles(root, langs, notesLang) {
	const quoted = langs.map((lang) => `'${lang}'`).join(', ');
	const config = {
		i18nDir: 'i18n',
		sourceDirs: ['src'],
		languageFile: 'languages.ts',
		rootScope: ROOT_SCOPE,
		importAlias: '@app/i18n',
		xliffPrefix: XLIFF_PREFIX,
		pipe: PIPE,
		...(undefined === notesLang ? {} : { notesLang }),
	};

	write(path.join(root, 'i18n.config.json'), json(config));
	write(
		path.join(root, 'languages.ts'),
		`export const LANGUAGES = [${quoted}] as const;\n\nexport const DEFAULT_LANGUAGE = '${langs[0]}';\n`,
	);
}

function contextFiles(i18nDir, scopeName, { app, scope, glossary, notes = {} } = {}) {
	const dir = path.join(i18nDir, 'context');

	if (undefined !== app) {
		write(path.join(dir, 'app.md'), app);
	}

	if (undefined !== scope) {
		write(path.join(dir, `${scopeName}.md`), scope);
	}

	if (undefined !== glossary) {
		write(path.join(dir, 'glossary.json'), json(glossary));
	}

	for (const [lang, texts] of Object.entries(notes)) {
		write(path.join(dir, `notes.${lang}.json`), 'string' === typeof texts ? texts : json(texts));
	}
}

export function createCatalogue(spec) {
	const { langs = ['es-ES', 'en-GB'], scopeName = 'demo', usages = '', params, notesLang } = spec;
	const root = mkdtempSync(path.join(tmpdir(), 'i18n-catalogue-'));
	const i18nDir = path.join(root, 'i18n');
	const sourceDir = path.join(root, 'src');
	const scopeDir = ROOT_SCOPE === scopeName ? i18nDir : path.join(i18nDir, scopeName);
	const keys = spec.keys.map((key, index) => ({ ulid: ulidOf(index), ...key }));
	const defaultLang = langs[0];

	DIRS.push(root);
	projectFiles(root, langs, notesLang);
	contextFiles(i18nDir, scopeName, spec.context);
	write(path.join(i18nDir, 'index.ts'), barrelOf(scopeName));
	write(path.join(scopeDir, 'keys.ts'), keysOf(scopeName, keys));
	write(path.join(i18nDir, 'state', `${scopeName}.json`), json(sealsOf(keys, langs, defaultLang)));
	write(path.join(sourceDir, 'page.html'), usagesOf(scopeName, keys, usages));

	for (const lang of langs) {
		write(path.join(scopeDir, `${lang}.json`), translationOf(keys, lang));
	}

	const catalogue = {
		root,
		i18nDir,
		sourceDir,
		scopeDir,
		langs,
		defaultLang,
		scopeName,
		keys,
		notesLang,
	};
	const generated = buildScopeParams(scopeOf(catalogue), defaultLang).content;
	const content = params ?? generated;

	if (null !== content) {
		write(path.join(scopeDir, 'params.ts'), content);
	}

	return catalogue;
}

export const scopesOf = ({ i18nDir, langs }) =>
	readScopes({ i18nDir, langs, rootScope: ROOT_SCOPE });

export const scopeOf = (catalogue) =>
	scopesOf(catalogue).find((scope) => scope.name === catalogue.scopeName);

export function findingsOf(catalogue) {
	const { i18nDir, sourceDir, langs, defaultLang, notesLang } = catalogue;
	const scopes = scopesOf(catalogue);
	const found = buildFindings({
		...collectUsages([sourceDir], { pipe: PIPE }),
		scopes,
		pipe: PIPE,
		langs,
		defaultLang,
		i18nDir,
		notesLang,
	});

	return found.map((item) => ({ ...item, severity: severityOf(item.type) }));
}

const labelOf = ({ severity, type, lang }) => `${severity} ${type}${lang ? ` [${lang}]` : ''}`;

export const linesOf = (findings) => findings.map((found) => `${labelOf(found)}: ${found.message}`);

export function removeCatalogues() {
	for (const dir of DIRS.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
}
