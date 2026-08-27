import { readBarrel } from '../catalogue/collect.mjs';
import { isUlid, toPascalCase } from '../catalogue/config.mjs';
import { matchesKey, readContext } from '../catalogue/context.mjs';
import { freshnessOf, readState } from '../catalogue/freshness.mjs';
import { buildScopeParams, entryLineOf, paramsName } from '../catalogue/params.mjs';

const PARAM_PATTERN = /\{\{\s*([\w.]+)\s*\}\}/g;
const PARAMS = 'params';
const FILE_START = { line: 1, col: 1 };

const finding = (type, scope, file, message, where = {}) => ({
	type,
	scope,
	file,
	message,
	line: where.line ?? null,
	col: where.col ?? null,
	lang: where.lang ?? null,
	column: where.column ?? null,
});

const paramsOf = (value) => new Set([...String(value).matchAll(PARAM_PATTERN)].map(([, n]) => n));

const isBlank = (value) => '' === String(value).trim();

const JSON_POSITION = /\bline (\d+) column (\d+)\b/;

function jsonAt(error) {
	const found = JSON_POSITION.exec(String(error));

	return found ? { line: Number(found[1]), col: Number(found[2]) } : {};
}

const expectedValue = (scope, ulid) => (scope.prefixed ? `${scope.name}.${ulid}` : ulid);

function checkLangFiles(scope, langs) {
	const findings = [];

	for (const lang of langs) {
		const { file, exists, error } = scope.translations.get(lang);

		if (!exists) {
			findings.push(finding('missing-lang-file', scope.name, file, 'file not found', { lang }));
		} else if (error) {
			findings.push(finding('invalid-json', scope.name, file, error, { ...jsonAt(error), lang }));
		}
	}

	return findings;
}

function checkStructure(scope, langs) {
	const findings = checkLangFiles(scope, langs);

	if (!scope.keys) {
		findings.push(finding('missing-keys-file', scope.name, scope.keysFile, 'keys.ts not found'));

		return findings;
	}

	const expected = `${toPascalCase(scope.name)}I18n`;

	if (scope.keys.constName !== expected) {
		const message = `exports "${scope.keys.constName}", expected "${expected}"`;
		const at = scope.keys.constAt ?? {};

		findings.push(finding('bad-const-name', scope.name, scope.keysFile, message, at));
	}

	return findings;
}

function checkKeys(scope, seenUlids) {
	const findings = [];

	for (const { name, value, ulid, line, col } of scope.keys.entries) {
		const previous = seenUlids.get(ulid);
		const at = { line, col };

		if (!isUlid(ulid)) {
			findings.push(
				finding('invalid-ulid', scope.name, scope.keysFile, `${name} = "${value}"`, at),
			);
		} else if (value !== expectedValue(scope, ulid)) {
			const message = `${name} = "${value}", expected "${expectedValue(scope, ulid)}"`;

			findings.push(finding('bad-scope-prefix', scope.name, scope.keysFile, message, at));
		} else if (previous) {
			const message = `${name} reuses the ULID of ${previous}`;

			findings.push(finding('duplicate-ulid', scope.name, scope.keysFile, message, at));
		} else {
			seenUlids.set(ulid, `${scope.name}.${name}`);
		}
	}

	return findings;
}

function positionOf(text, ulid) {
	const lines = String(text ?? '').split('\n');
	const line = lines.findIndex((content) => content.includes(`"${ulid}"`));

	return -1 === line ? {} : { line: line + 1, col: lines[line].indexOf(`"${ulid}"`) + 1 };
}

// Nothing to point at in the file that lacks the entry, so the location is where the check
// read it from: the default language, or keys.ts when that lacks it too.
function missingAt(scope, entry, source) {
	if (source?.data && entry.ulid in source.data) {
		return { file: source.file, ...positionOf(source.text, entry.ulid) };
	}

	return { file: scope.keysFile, line: entry.line, col: entry.col };
}

const pendingAtSource = (source, ulid) =>
	Boolean(source?.data) && (!(ulid in source.data) || isBlank(source.data[ulid]));

function checkDeclared(scope, translation, lang, source) {
	const findings = [];

	for (const entry of scope.keys.entries) {
		const value = translation.data[entry.ulid];

		if ((undefined !== value && !isBlank(value)) || pendingAtSource(source, entry.ulid)) {
			continue;
		}

		const label = `${entry.name} (${entry.ulid})`;

		if (undefined === value) {
			const at = missingAt(scope, entry, source);
			const message = `${label} has no "${lang}" entry`;

			findings.push(finding('missing-translation', scope.name, at.file, message, { ...at, lang }));
		} else {
			const at = { ...positionOf(translation.text, entry.ulid), lang };

			findings.push(finding('empty-translation', scope.name, translation.file, label, at));
		}
	}

	return findings;
}

function checkOrphans(declared, { file, data, text }, lang, scopeName) {
	return Object.keys(data)
		.filter((ulid) => !declared.has(ulid))
		.map((ulid) =>
			finding('orphan-translation', scopeName, file, `${ulid} is not declared`, {
				...positionOf(text, ulid),
				lang,
			}),
		);
}

function checkTranslations(scope, langs, defaultLang) {
	const declared = new Set(scope.keys.entries.map(({ ulid }) => ulid));
	const source = scope.translations.get(defaultLang);
	const findings = [];

	for (const lang of langs) {
		const translation = scope.translations.get(lang);
		const origin = lang === defaultLang ? null : source;

		if (translation.data) {
			findings.push(...checkDeclared(scope, translation, lang, origin));
			findings.push(...checkOrphans(declared, translation, lang, scope.name));
		}
	}

	return findings;
}

function staleFinding(scope, { ulid, name, lang }, defaultLang) {
	const translation = scope.translations.get(lang);
	const message = `${name} (${ulid}) was translated from an older "${defaultLang}"`;
	const at = { ...positionOf(translation.text, ulid), lang };

	return finding('stale-translation', scope.name, translation.file, message, at);
}

function checkFreshness(scope, { langs, defaultLang, i18nDir }) {
	const state = readState(i18nDir, scope.name);

	if (state.error) {
		return [finding('invalid-json', scope.name, state.file, state.error, jsonAt(state.error))];
	}

	return freshnessOf(scope, state, { langs, defaultLang })
		.filter((entry) => 'stale' === entry.status)
		.map((entry) => staleFinding(scope, entry, defaultLang));
}

function checkUsage(scope, usages, commented) {
	return scope.keys.entries
		.filter(({ name }) => !usages.has(`${scope.name}:${name}`))
		.map(({ name, line, col }) => {
			const at = { line, col };

			if (commented.has(`${scope.name}:${name}`)) {
				const message = `${name} is only referenced from a comment`;

				return finding('commented-usage', scope.name, scope.keysFile, message, at);
			}

			return finding('unused-key', scope.name, scope.keysFile, `${name} is never referenced`, at);
		});
}

const listOf = (names) => `{{ ${names.join(' }}, {{ ')} }}`;

function comparePair(base, value, ulid) {
	const expected = paramsOf(base);
	const actual = paramsOf(value);
	const dropped = [...expected].filter((name) => !actual.has(name));
	const added = [...actual].filter((name) => !expected.has(name));

	return [
		...(dropped.length ? [`${ulid} drops ${listOf(dropped)}`] : []),
		...(added.length ? [`${ulid} adds ${listOf(added)}`] : []),
	];
}

function comparePairs(base, translation, lang, { scope, drifting }) {
	const findings = [];

	for (const [ulid, value] of Object.entries(translation.data)) {
		if (!(ulid in base) || isBlank(value) || drifting.has(expectedValue(scope, ulid))) {
			continue;
		}

		for (const message of comparePair(base[ulid], value, ulid)) {
			const where = { ...positionOf(translation.text, ulid), lang, column: PARAMS };
			const file = translation.file;

			findings.push(finding('param-mismatch', scope.name, file, `${message} in "${lang}"`, where));
		}
	}

	return findings;
}

function checkParams(scope, langs, defaultLang, params) {
	const base = scope.translations.get(defaultLang)?.data;
	const findings = [];

	if (!base || (params.required && !params.exists)) {
		return findings;
	}

	const drifting = new Set(params.drift.map(({ key }) => key));

	for (const lang of langs.filter((entry) => entry !== defaultLang)) {
		const translation = scope.translations.get(lang);

		if (translation.data) {
			findings.push(...comparePairs(base, translation, lang, { scope, drifting }));
		}
	}

	return findings;
}

function driftFinding(scope, params, { key, removed }) {
	const entry = scope.keys.entries.find((item) => item.value === key);
	const message = removed
		? `${key} is no longer declared`
		: `${entry?.name ?? key} (${key}) does not match the default language`;
	const at = { ...FILE_START, ...entryLineOf(params.current, key), column: PARAMS };

	return finding('stale-params', scope.name, params.file, message, at);
}

function checkParamsFile(scope, params) {
	if (!params.exists) {
		const message = `params.ts not found, ${paramsName(scope.name)} is not generated yet`;

		return params.required
			? [finding('missing-params-file', scope.name, params.file, message, { column: PARAMS })]
			: [];
	}

	if (!params.stale) {
		return [];
	}

	if (0 === params.drift.length) {
		const message = `${paramsName(scope.name)} needs regenerating`;
		const at = { ...FILE_START, column: PARAMS };

		return [finding('stale-params', scope.name, params.file, message, at)];
	}

	return params.drift.map((item) => driftFinding(scope, params, item));
}

// Only what the barrel itself can be blamed for: a params file that is not there
// yet is reported where it is missing, not as an import nobody could have written.
function barrelFindings(scope, barrel, params) {
	const findings = [];

	if (!barrel.scopes.has(scope.name)) {
		const message = `${toPascalCase(scope.name)}I18n is never added to the I18n barrel`;

		findings.push(finding('unregistered-scope', scope.name, barrel.file, message, barrel));
	}

	if (params.exists && !barrel.params.has(paramsName(scope.name))) {
		const message = `${paramsName(scope.name)} is never added to the I18nParams union`;
		const at = { line: barrel.line, col: barrel.col, ...barrel.paramsAt, column: PARAMS };

		findings.push(finding('unregistered-params', scope.name, barrel.file, message, at));
	}

	return findings;
}

const GLOSSARY = 'glossary';

// A heading nobody can reach: the constant was renamed, or the pattern never
// caught anything. Silent otherwise, so a scope with no context file is fine.
function checkContextKeys(context, scopes) {
	const findings = [];

	for (const [name, file] of context.scopes) {
		const scope = scopes.find((entry) => entry.name === name);
		const names = scope?.keys?.entries.map((entry) => entry.name) ?? [];

		for (const { heading, line } of file.sections) {
			if (names.some((key) => matchesKey(heading, key))) {
				continue;
			}

			const message = `"${heading}" matches no key of the "${name}" scope`;

			findings.push(finding('unknown-context-key', name, file.file, message, { line, col: 1 }));
		}
	}

	return findings;
}

// A term with no entry for a language is not an error — it is the glossary's
// own to-do list, in the column of the language that still needs the word.
function checkGlossary({ glossary }, langs, defaultLang) {
	if (glossary.error) {
		const at = jsonAt(glossary.error);

		return [finding('invalid-json', GLOSSARY, glossary.file, glossary.error, at)];
	}

	return glossary.terms.flatMap(({ term, translations, line, col }) =>
		langs
			.filter((lang) => lang !== defaultLang && '' === String(translations?.[lang] ?? '').trim())
			.map((lang) => {
				const message = `"${term}" has no "${lang}" translation`;

				return finding('glossary-term-missing-lang', GLOSSARY, glossary.file, message, {
					line,
					col,
					lang,
				});
			}),
	);
}

function checkContext(options, scopes) {
	const context = readContext(options);

	if (!context.exists) {
		return [];
	}

	return [
		...checkContextKeys(context, scopes),
		...checkGlossary(context, options.langs, options.defaultLang),
	];
}

function checkBarrel(scopes, barrel, paramsOfScope) {
	if (!barrel.exists) {
		return [finding('missing-barrel', 'all', barrel.file, 'index.ts not found')];
	}

	return scopes
		.filter((scope) => scope.keys)
		.flatMap((scope) => barrelFindings(scope, barrel, paramsOfScope.get(scope.name)));
}

export function buildFindings({ scopes, usages, commented, langs, defaultLang, i18nDir }) {
	const seenUlids = new Map();
	const paramsOfScope = new Map(
		scopes
			.filter((scope) => scope.keys)
			.map((scope) => [scope.name, buildScopeParams(scope, defaultLang)]),
	);
	const findings = checkBarrel(scopes, readBarrel(i18nDir), paramsOfScope);

	findings.push(...checkContext({ i18nDir, langs, defaultLang }, scopes));

	for (const scope of scopes) {
		findings.push(...checkStructure(scope, langs));

		if (!scope.keys) {
			continue;
		}

		const params = paramsOfScope.get(scope.name);

		findings.push(...checkKeys(scope, seenUlids));
		findings.push(...checkTranslations(scope, langs, defaultLang));
		findings.push(...checkFreshness(scope, { langs, defaultLang, i18nDir }));
		findings.push(...checkUsage(scope, usages, commented));
		findings.push(...checkParamsFile(scope, params));
		findings.push(...checkParams(scope, langs, defaultLang, params));
	}

	return findings;
}
