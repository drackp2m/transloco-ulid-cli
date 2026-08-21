import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

import { DEFAULTS, RESERVED_DIRS, toKebabCase } from './config.mjs';

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

function findConstName(source) {
	for (const statement of source.statements) {
		if (!ts.isVariableStatement(statement)) {
			continue;
		}

		const [declaration] = statement.declarationList.declarations;

		if (declaration && ts.isIdentifier(declaration.name)) {
			return declaration.name.text;
		}
	}

	return null;
}

function readKeysFile(file) {
	const content = readFileSync(file, 'utf8');
	const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);

	return { constName: findConstName(source), entries: collectEntries(source) };
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

	if (!existsSync(file)) {
		return { file, exists: false };
	}

	const text = readFileSync(file, 'utf8');
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

function readTranslation(file) {
	if (!existsSync(file)) {
		return { exists: false, data: null, error: null, text: null };
	}

	try {
		const text = readFileSync(file, 'utf8');

		return { exists: true, data: JSON.parse(text), error: null, text };
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
		keys: existsSync(keysFile) ? readKeysFile(keysFile) : null,
		translations,
	};
}

export function readScopes({ i18nDir, langs, rootScope = DEFAULTS.rootScope }) {
	if (!existsSync(i18nDir)) {
		return [];
	}

	const nested = readdirSync(i18nDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && !RESERVED_DIRS.has(entry.name))
		.map((entry) => readScope(path.join(i18nDir, entry.name), entry.name, langs, true));

	if (!existsSync(path.join(i18nDir, 'keys.ts'))) {
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

// Split each file into its "real" code (comments blanked out, so a key merely
// mentioned in a comment never counts as usage) and its comments alone (so a
// key that only shows up there can still be flagged, separately, as such).
function splitComments(content, file) {
	const ranges =
		'.html' === path.extname(file) ? htmlCommentRanges(content) : tsCommentRanges(content);
	const code = ranges.reduce((text, [start, end]) => blank(text, start, end), content);
	const comments = ranges.map(([start, end]) => content.slice(start, end)).join('\n');

	return { code, comments };
}

function recordUsages(content, file, usages) {
	const add = (scope, key) => {
		const id = `${scope}:${key}`;

		usages.set(id, [...(usages.get(id) ?? []), file]);
	};

	for (const pattern of USAGE_PATTERNS) {
		for (const [, scopeToken, key] of content.matchAll(pattern)) {
			add(toKebabCase(scopeToken), key);
		}
	}
}

export function collectUsages(sourceDirs) {
	const usages = new Map();
	const commented = new Map();

	for (const dir of sourceDirs.filter((entry) => existsSync(entry))) {
		for (const file of walkSources(dir)) {
			const { code, comments } = splitComments(readFileSync(file, 'utf8'), file);

			recordUsages(code, file, usages);
			recordUsages(comments, file, commented);
		}
	}

	return { usages, commented };
}
