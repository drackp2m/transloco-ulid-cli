import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

import { RESERVED_DIRS, readDefaults, toKebabCase } from './config.mjs';
import { fileExists, readText } from './files.mjs';

const SOURCE_EXTENSIONS = new Set(['.ts', '.html']);
const CONST_USAGE = /\b([A-Z][A-Za-z0-9]*)I18n\s*\.\s*([A-Z][A-Z0-9_]*)\b/g;
const BARREL_USAGE = /\bI18n\s*\.\s*([a-z][A-Za-z0-9]*)\s*\.\s*([A-Z][A-Z0-9_]*)\b/g;

export const USAGE_PATTERNS = [CONST_USAGE, BARREL_USAGE];

function collectEntries(source) {
	const entries = [];

	const visit = (node) => {
		if (ts.isPropertyAssignment(node) && ts.isStringLiteralLike(node.initializer)) {
			const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));

			entries.push({
				name: node.name.getText(source),
				value: node.initializer.text,
				ulid: node.initializer.text.split('.').pop(),
				line: line + 1,
				col: character + 1,
			});
		}

		ts.forEachChild(node, visit);
	};

	visit(source);

	return entries;
}

function findConstDeclaration(source) {
	for (const statement of source.statements) {
		if (!ts.isVariableStatement(statement)) {
			continue;
		}

		const [declaration] = statement.declarationList.declarations;

		if (declaration && ts.isIdentifier(declaration.name)) {
			return declaration.name;
		}
	}

	return null;
}

function readKeysFile(file) {
	const content = readText(file);
	const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
	const constant = findConstDeclaration(source);

	return {
		constName: constant?.text ?? null,
		constAt: positionOf(source, constant),
		entries: collectEntries(source),
	};
}

const BARREL_CONST = 'I18n';
const BARREL_PARAMS = 'I18nParams';

function intersectionMembers(node) {
	if (ts.isIntersectionTypeNode(node)) {
		return node.types.flatMap((type) => intersectionMembers(type));
	}

	return ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName) ? [node.typeName.text] : [];
}

function findParamsAlias(source) {
	let found = null;

	const visit = (node) => {
		if (ts.isTypeAliasDeclaration(node) && BARREL_PARAMS === node.name.text) {
			found = node;
		}

		ts.forEachChild(node, visit);
	};

	visit(source);

	return found;
}

function barrelObject(declaration) {
	const initializer = ts.isAsExpression(declaration.initializer)
		? declaration.initializer.expression
		: declaration.initializer;

	return initializer && ts.isObjectLiteralExpression(initializer) ? initializer : null;
}

function positionOf(source, node) {
	if (!node) {
		return {};
	}

	const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));

	return { line: line + 1, col: character + 1 };
}

function findBarrelDeclaration(source) {
	let found = null;

	const visit = (node) => {
		if (
			ts.isVariableDeclaration(node) &&
			ts.isIdentifier(node.name) &&
			BARREL_CONST === node.name.text
		) {
			found = node;
		}

		ts.forEachChild(node, visit);
	};

	visit(source);

	return found;
}

export function parseBarrelSource(i18nDir) {
	const file = path.join(i18nDir, 'index.ts');

	if (!fileExists(file)) {
		return { file, exists: false };
	}

	const text = readText(file);
	const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
	const declaration = findBarrelDeclaration(source);

	return {
		file,
		exists: true,
		text,
		source,
		declaration,
		object: declaration ? barrelObject(declaration) : null,
		imports: source.statements.filter((statement) => ts.isImportDeclaration(statement)),
		alias: findParamsAlias(source),
	};
}

export function readBarrel(i18nDir) {
	const parsed = parseBarrelSource(i18nDir);

	if (!parsed.exists) {
		return { file: parsed.file, exists: false, scopes: new Set(), params: new Set(), paramsAt: {} };
	}

	const { file, source, declaration, object, alias } = parsed;
	const properties = (object?.properties ?? []).filter((property) =>
		ts.isPropertyAssignment(property),
	);

	return {
		file,
		exists: true,
		...positionOf(source, declaration),
		scopes: new Set(properties.map((property) => toKebabCase(property.name.getText(source)))),
		params: new Set(alias ? intersectionMembers(alias.type) : []),
		paramsAt: positionOf(source, alias),
	};
}

export function parseTranslation(text) {
	try {
		return { exists: true, data: JSON.parse(text), error: null, text };
	} catch (error) {
		return { exists: true, data: null, error: error.message, text: null };
	}
}

function readTranslation(file) {
	if (!fileExists(file)) {
		return { exists: false, data: null, error: null, text: null };
	}

	try {
		return parseTranslation(readText(file));
	} catch (error) {
		return { exists: true, data: null, error: error.message, text: null };
	}
}

function readScope(dir, name, langs, prefixed) {
	const keysFile = path.join(dir, 'keys.ts');
	const translations = new Map();

	for (const lang of langs) {
		const file = path.join(dir, `${lang}.json`);

		translations.set(lang, { file, ...readTranslation(file) });
	}

	return {
		name,
		dir,
		keysFile,
		prefixed,
		keys: fileExists(keysFile) ? readKeysFile(keysFile) : null,
		translations,
	};
}

export function readScopes({ i18nDir, langs, rootScope = readDefaults().rootScope }) {
	if (!existsSync(i18nDir)) {
		return [];
	}

	const nested = readdirSync(i18nDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && !RESERVED_DIRS.has(entry.name))
		.map((entry) => readScope(path.join(i18nDir, entry.name), entry.name, langs, true));

	if (!fileExists(path.join(i18nDir, 'keys.ts'))) {
		return nested;
	}

	return [readScope(i18nDir, rootScope, langs, false), ...nested];
}

function* walkSources(dir) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);

		if (entry.isDirectory()) {
			if ('node_modules' !== entry.name) {
				yield* walkSources(full);
			}

			continue;
		}

		if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
			yield full;
		}
	}
}

function blank(text, start, end) {
	return text.slice(0, start) + ' '.repeat(end - start) + text.slice(end);
}

function tsCommentRanges(content) {
	const scanner = ts.createScanner(
		ts.ScriptTarget.Latest,
		false,
		ts.LanguageVariant.Standard,
		content,
	);
	const ranges = [];
	let token = scanner.scan();

	while (ts.SyntaxKind.EndOfFileToken !== token) {
		if (
			ts.SyntaxKind.SingleLineCommentTrivia === token ||
			ts.SyntaxKind.MultiLineCommentTrivia === token
		) {
			ranges.push([scanner.getTokenPos(), scanner.getTextPos()]);
		}

		token = scanner.scan();
	}

	return ranges;
}

function htmlCommentRanges(content) {
	return [...content.matchAll(/<!--[\s\S]*?-->/g)].map((match) => [
		match.index,
		match.index + match[0].length,
	]);
}

const commentRanges = (content, file) =>
	'.html' === path.extname(file) ? htmlCommentRanges(content) : tsCommentRanges(content);

const INTERPOLATION_OPEN = '{{';
const INTERPOLATION_CLOSE = '}}';

function insideInterpolation(code, start) {
	const opened = code.lastIndexOf(INTERPOLATION_OPEN, start);

	return -1 !== opened && opened > code.lastIndexOf(INTERPOLATION_CLOSE, start);
}

function pipedBeforeClosing(code, end, piped) {
	const closed = code.indexOf(INTERPOLATION_CLOSE, end);

	return piped.test(code.slice(end, -1 === closed ? code.length : closed));
}

function positionAt(text, index) {
	const before = text.slice(0, index);

	return { line: before.split('\n').length, col: index - before.lastIndexOf('\n') };
}

const pipedPattern = (pipe) => new RegExp(`\\|\\s*${pipe.replaceAll('$', '\\$')}(?![\\w$])`);

function matchesIn(text, offset) {
	return USAGE_PATTERNS.flatMap((pattern) =>
		[...text.matchAll(pattern)].map((match) => ({
			scope: toKebabCase(match[1]),
			key: match[2],
			barrel: BARREL_USAGE === pattern,
			start: offset + match.index,
			end: offset + match.index + match[0].length,
		})),
	);
}

function bareTest(code, file, pipe) {
	if (null === pipe || '.html' !== path.extname(file)) {
		return () => false;
	}

	const piped = pipedPattern(pipe);

	return ({ start, end }) =>
		insideInterpolation(code, start) && !pipedBeforeClosing(code, end, piped);
}

// Every reference to a key one text holds, in the order it is written. The code and the
// comments are read apart, so a key merely mentioned in a comment is not usage, and one
// appearing only there can still be flagged. `bare` is a template interpolating the key
// without the pipe that would translate it.
export function usagesIn(content, file, { pipe = null } = {}) {
	const ranges = commentRanges(content, file);
	const code = ranges.reduce((text, [start, end]) => blank(text, start, end), content);
	const isBare = bareTest(code, file, pipe);
	const written = matchesIn(code, 0).map((usage) => ({
		...usage,
		commented: false,
		bare: isBare(usage),
	}));
	const mentioned = ranges
		.flatMap(([start, end]) => matchesIn(content.slice(start, end), start))
		.map((usage) => ({ ...usage, commented: true, bare: false }));

	return [...written, ...mentioned]
		.sort((left, right) => left.start - right.start)
		.map((usage) => ({ ...usage, ...positionAt(content, usage.start) }));
}

const idOf = ({ scope, key }) => `${scope}:${key}`;

function record(usages, id, file) {
	usages.set(id, [...(usages.get(id) ?? []), file]);
}

function recordFile(found, file, { pipe }) {
	for (const usage of usagesIn(readText(file), file, { pipe })) {
		const { scope, key, barrel, line, col } = usage;
		const length = usage.end - usage.start;

		if (usage.commented) {
			record(found.commented, idOf(usage), file);

			continue;
		}

		record(found.usages, idOf(usage), file);
		found.sites.push({ file, scope, key, barrel, line, col, length });

		if (usage.bare) {
			found.bare.push({ file, scope, key, line, col });
		}
	}
}

export function collectUsages(sourceDirs, { pipe = null } = {}) {
	const found = { usages: new Map(), commented: new Map(), bare: [], sites: [] };

	for (const dir of sourceDirs.filter((entry) => existsSync(entry))) {
		for (const file of walkSources(dir)) {
			recordFile(found, file, { pipe });
		}
	}

	return found;
}
