import { readFileSync, writeFileSync } from 'node:fs';

import ts from 'typescript';

import { parseBarrelSource } from '../catalogue/collect.mjs';
import { isUlid, toKebabCase, toPascalCase } from '../catalogue/config.mjs';
import { readState, writeState } from '../catalogue/freshness.mjs';
import { buildParams } from '../catalogue/params.mjs';

// Keys no longer declared are dropped: a translation is either backed by a
// keys.ts entry or it is dead weight nobody can reach through I18n.
function nextContent(scope, translation) {
	const data = translation.data ?? {};
	const result = {};

	for (const { ulid } of scope.keys.entries.filter((entry) => isUlid(entry.ulid))) {
		result[ulid] = data[ulid] ?? '';
	}

	return `${JSON.stringify(result, null, '\t')}\n`;
}

const scopeImportPath = (scope) =>
	scope.prefixed ? `@app/i18n/${scope.name}/keys` : '@app/i18n/keys';

const scopeConstName = (scope) => `${toPascalCase(scope.name)}I18n`;

const scopePropertyName = (scope) => {
	const pascal = toPascalCase(scope.name);

	return pascal.charAt(0).toLowerCase() + pascal.slice(1);
};

// Text-splice rather than reprint the whole file: the barrel also carries
// hand-written type plumbing (I18nScope, i18nRef) a printer would reformat.
function nextBarrelContent(parsed, missing) {
	const lastImport = parsed.imports.at(-1);
	const importLines = missing
		.map((scope) => `import { ${scopeConstName(scope)} } from '${scopeImportPath(scope)}';`)
		.join('\n');
	const withImports = lastImport
		? `${parsed.text.slice(0, lastImport.getEnd())}\n${importLines}${parsed.text.slice(lastImport.getEnd())}`
		: parsed.text;

	const shift = withImports.length - parsed.text.length;
	const propertyLines = missing
		.map((scope) => `\t${scopePropertyName(scope)}: ${scopeConstName(scope)},`)
		.join('\n');
	// NodeArray.end lands after the trailing comma (unlike the last node's own
	// end), so the split falls between it and the closing brace on its own line.
	const insertAt = parsed.object.properties.end + shift;

	return `${withImports.slice(0, insertAt)}\n${propertyLines}${withImports.slice(insertAt)}`;
}

function fixBarrel(i18nDir, scopes) {
	const parsed = parseBarrelSource(i18nDir);

	if (!parsed.exists || !parsed.object) {
		return null;
	}

	const registered = new Set(
		parsed.object.properties
			.filter((property) => ts.isPropertyAssignment(property))
			.map((property) => toKebabCase(property.name.getText(parsed.source))),
	);
	const missing = scopes.filter((scope) => scope.keys && !registered.has(scope.name));

	if (!missing.length) {
		return null;
	}

	return { file: parsed.file, content: nextBarrelContent(parsed, missing) };
}

function writeTranslations(scope, langs, written) {
	for (const lang of langs) {
		const translation = scope.translations.get(lang);

		if (translation.error) {
			continue;
		}

		const content = nextContent(scope, translation);
		const current = translation.exists ? readFileSync(translation.file, 'utf8') : null;

		if (content !== current) {
			writeFileSync(translation.file, content, 'utf8');
			written.push(translation.file);
		}
	}
}

export function applyFix({ scopes, langs, defaultLang, i18nDir }) {
	const written = [];
	const owned = scopes.filter((entry) => entry.keys);

	for (const scope of owned) {
		writeTranslations(scope, langs, written);
	}

	for (const scope of owned) {
		const state = readState(i18nDir, scope.name);
		const file = state.error ? null : writeState(scope, { i18nDir, langs, data: state.data });

		if (null !== file) {
			written.push(file);
		}
	}

	for (const params of buildParams({ scopes, defaultLang }).filter((entry) => entry.stale)) {
		writeFileSync(params.file, params.content, 'utf8');
		written.push(params.file);
	}

	const barrel = fixBarrel(i18nDir, scopes);

	if (barrel) {
		writeFileSync(barrel.file, barrel.content, 'utf8');
		written.push(barrel.file);
	}

	return written;
}
