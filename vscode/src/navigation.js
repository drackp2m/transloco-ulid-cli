const { readFileSync } = require('node:fs');
const path = require('node:path');

const vscode = require('vscode');

const I18N_SELECTOR = [
	{ scheme: 'file', language: 'typescript' },
	{ scheme: 'file', language: 'json' },
	{ scheme: 'file', language: 'jsonc' },
];

const KEYS_LINE = /^(\s*)([A-Z][A-Z0-9_]*)(\s*:\s*)('[^']*')/;
const PARAMS_LINE = /^(\s*)('[^']*')(\s*:\s*\{)/;
const JSON_LINE = /^(\s*)("[^"]*")(\s*:\s*)(.+?),?\s*$/;

const ulidOf = (value) => value.replace(/['"]/g, '').split('.').pop();

const within = (character, start, length) => character >= start && character <= start + length;

function hitAt(position, fields) {
	const found = fields.find(({ start, length }) => within(position.character, start, length));

	if (undefined === found) {
		return null;
	}

	const { line } = position;

	return {
		origin: new vscode.Range(line, found.start, line, found.start + found.length),
		targets: found.resolve(),
	};
}

function toLinks(found) {
	if (null === found) {
		return null;
	}

	return found.targets.map((target) => ({
		originSelectionRange: found.origin,
		targetUri: target.uri,
		targetRange: target.range,
	}));
}

function valueStart(line, from) {
	const colon = line.indexOf(':', from);

	if (-1 === colon) {
		return from;
	}

	const rest = line.slice(colon + 1);

	return colon + 1 + rest.length - rest.trimStart().length;
}

const valueLength = (line, from) => line.slice(from).replace(/,\s*$/, '').trimEnd().length;

function fileLines(file) {
	try {
		return readFileSync(file, 'utf8').split('\n');
	} catch {
		return null;
	}
}

function spanLocation(file, line, start, length) {
	return new vscode.Location(
		vscode.Uri.file(file),
		new vscode.Range(line, start, line, start + length),
	);
}

function lineOf(lines, needle) {
	return lines.findIndex((content) => content.includes(needle));
}

function jsonLocation(file, ulid, part) {
	const lines = null === file ? null : fileLines(file);
	const needle = `"${ulid}"`;
	const line = null === lines ? -1 : lineOf(lines, needle);

	if (-1 === line) {
		return null;
	}

	const start = lines[line].indexOf(needle);

	if ('value' !== part) {
		return spanLocation(file, line, start, needle.length);
	}

	const from = valueStart(lines[line], start + needle.length);

	return spanLocation(file, line, from, valueLength(lines[line], from));
}

function translationTargets(
	index,
	scope,
	ulid,
	{ langs = [index.displayLang], part = 'key' } = {},
) {
	return langs
		.map((lang) => jsonLocation(index.translation(scope.name, ulid, lang).file, ulid, part))
		.filter((target) => null !== target);
}

function keyTargets(index, scope, ulid) {
	const entry = index.entryByUlid(scope.name, ulid);
	const lines = null === entry ? null : fileLines(scope.keysFile);
	const line = null === lines ? -1 : lineOf(lines, entry.ulid);

	if (-1 === line) {
		return [];
	}

	return [spanLocation(scope.keysFile, line, lines[line].indexOf(entry.name), entry.name.length)];
}

function keysTargets(index, usages, scope, line, position) {
	const match = KEYS_LINE.exec(line);

	if (null === match) {
		return null;
	}

	const [, indent, name, middle, value] = match;

	return hitAt(position, [
		{
			start: indent.length,
			length: name.length,
			resolve: () => usages.locationsOf(scope.name, name),
		},
		{
			start: indent.length + name.length + middle.length,
			length: value.length,
			resolve: () => translationTargets(index, scope, ulidOf(value)),
		},
	]);
}

function paramsTargets(index, scope, line, position) {
	const match = PARAMS_LINE.exec(line);

	if (null === match) {
		return null;
	}

	const [, indent, key] = match;

	return hitAt(position, [
		{
			start: indent.length,
			length: key.length,
			resolve: () => translationTargets(index, scope, ulidOf(key)),
		},
	]);
}

function langTargets(index, { scope, lang }, line, position) {
	const match = JSON_LINE.exec(line);

	if (null === match) {
		return null;
	}

	const [, indent, key, middle, value] = match;
	const ulid = ulidOf(key);
	const langs = index.langs.filter((entry) => entry !== lang);

	return hitAt(position, [
		{ start: indent.length, length: key.length, resolve: () => keyTargets(index, scope, ulid) },
		{
			start: indent.length + key.length + middle.length,
			length: value.length,
			resolve: () => translationTargets(index, scope, ulid, { langs, part: 'value' }),
		},
	]);
}

function fileOf(index, document) {
	const file = document.uri.fsPath;
	const scope = index.scopeAt(path.dirname(file));

	if (null === scope) {
		return null;
	}

	const base = path.basename(file);
	const lang = index.langs.find((entry) => `${entry}.json` === base);

	if (undefined !== lang) {
		return { scope, lang, kind: 'lang' };
	}

	return 'keys.ts' === base || 'params.ts' === base ? { scope, kind: base.slice(0, -3) } : null;
}

function targetsAt(index, usages, document, position) {
	const found = fileOf(index, document);

	if (null === found) {
		return null;
	}

	const { text } = document.lineAt(position.line);

	if ('keys' === found.kind) {
		return keysTargets(index, usages, found.scope, text, position);
	}

	return 'params' === found.kind
		? paramsTargets(index, found.scope, text, position)
		: langTargets(index, found, text, position);
}

function i18nDefinitionProvider(index, usages) {
	return vscode.languages.registerDefinitionProvider(I18N_SELECTOR, {
		provideDefinition(document, position) {
			return toLinks(targetsAt(index, usages, document, position));
		},
	});
}

function i18nReferenceProvider(index, usages) {
	return vscode.languages.registerReferenceProvider(I18N_SELECTOR, {
		provideReferences(document, position) {
			return targetsAt(index, usages, document, position)?.targets ?? null;
		},
	});
}

module.exports = { i18nDefinitionProvider, i18nReferenceProvider, jsonLocation, keyTargets };
