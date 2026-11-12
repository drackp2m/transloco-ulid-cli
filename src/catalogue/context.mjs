import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { readNoteTexts } from './note-texts.mjs';

export const CONTEXT_DIR = 'context';
export const APP_FILE = 'app.md';
export const GLOSSARY_FILE = 'glossary.json';

const HEADING = /^##\s+(.+?)\s*$/;
const TITLE = /^#\s/;

const textOf = (lines) => lines.join('\n').trim();

// A heading lists one or more names, separated by commas: constant names
// (SYNC_ROWS) or group patterns (SYNC_*); everything else in a name is literal.
const isGroup = (name) => name.includes('*');

const patternOf = (name) => {
	const escaped = name.replace(/[.+?^${}()|[\]\\]/g, (char) => `\\${char}`);

	return new RegExp(`^${escaped.replaceAll('*', '[A-Z0-9_]*')}$`);
};

export const matchesKey = (name, key) => patternOf(name).test(key);

function namesOf(heading, offset) {
	const names = [];
	let from = 0;

	for (const part of heading.split(',')) {
		const name = part.trim();

		if ('' !== name) {
			names.push({ name, col: offset + from + part.indexOf(name) + 1 });
		}

		from += part.length + 1;
	}

	return names;
}

function parseSections(text) {
	const intro = [];
	const sections = [];
	let current = null;

	text.split('\n').forEach((line, index) => {
		const [, heading] = HEADING.exec(line) ?? [];

		if (undefined !== heading) {
			const names = namesOf(heading, line.indexOf(heading));

			current = { heading, names, line: index + 1, lines: [] };
			sections.push(current);
		} else if (!TITLE.test(line)) {
			(current?.lines ?? intro).push(line);
		}
	});

	return {
		intro: textOf(intro),
		sections: sections.map(({ lines, ...section }) => ({ ...section, text: textOf(lines) })),
	};
}

function readMarkdown(file) {
	if (!existsSync(file)) {
		return { file, exists: false, intro: '', sections: [] };
	}

	return { file, exists: true, ...parseSections(readFileSync(file, 'utf8')) };
}

const lineOf = (text, needle) => {
	const line = String(text)
		.split('\n')
		.findIndex((content) => content.includes(needle));

	return -1 === line ? {} : { line: line + 1, col: 1 };
};

function readGlossary(file) {
	if (!existsSync(file)) {
		return { file, exists: false, terms: [], keep: [] };
	}

	const text = readFileSync(file, 'utf8');

	try {
		const data = JSON.parse(text);
		const terms = (data.terms ?? []).map((term) => ({
			...term,
			...lineOf(text, `"${term.term}"`),
		}));

		return { file, exists: true, error: null, terms, keep: data.keep ?? [] };
	} catch (error) {
		return { file, exists: true, error: error.message, terms: [], keep: [] };
	}
}

function readScopeFiles(dir) {
	const scopes = new Map();

	if (!existsSync(dir)) {
		return scopes;
	}

	const names = readdirSync(dir)
		.filter((name) => '.md' === path.extname(name) && APP_FILE !== name)
		.map((name) => path.basename(name, '.md'));

	for (const name of names) {
		scopes.set(name, readMarkdown(path.join(dir, `${name}.md`)));
	}

	return scopes;
}

function levelOf(section, keyName) {
	const matched = section.names.filter(({ name }) => matchesKey(name, keyName));

	if (0 === matched.length) {
		return null;
	}

	return matched.some(({ name }) => !isGroup(name)) ? 'key' : 'group';
}

// General to specific, accumulating: app → language → scope → group → key. A
// layer with nothing written for it simply drops out.
function resolve({ app, languages, scopes }, scopeName, keyName, lang) {
	const scope = scopes.get(scopeName);
	const matching = (scope?.sections ?? [])
		.map((section) => ({ section, level: levelOf(section, keyName ?? '') }))
		.filter(({ level }) => null !== level)
		.sort((left, right) => Number('group' === right.level) - Number('group' === left.level));

	return [
		{ level: 'app', text: app.intro },
		{ level: 'language', text: languages.get(lang) ?? '' },
		{ level: 'scope', text: scope?.intro ?? '' },
		...matching.map(({ section, level }) => ({
			level,
			heading: section.heading,
			text: section.text,
		})),
	].filter((layer) => '' !== layer.text);
}

const patterns = new Map();

// A glossary term is a hint and not a rule, so it matches whole words case-insensitively
// and tolerates the plural: "jugadas" still pulls in "jugada".
function termPattern(term) {
	if (!patterns.has(term)) {
		const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, (char) => `\\${char}`);

		patterns.set(term, new RegExp(`(?<!\\p{L})${escaped}(?:e?s)?(?!\\p{L})`, 'iu'));
	}

	return patterns.get(term);
}

export function termsIn(glossary, texts) {
	const matched = glossary.terms.filter((entry) =>
		texts.some((text) => termPattern(entry.term).test(String(text ?? ''))),
	);

	// "jaque mate" drags "jaque" in with it; the longer term is the one that
	// carries the meaning, so the one it swallows drops out.
	return matched.filter(
		(entry) => !matched.some((other) => other !== entry && other.term.includes(entry.term)),
	);
}

export function readContext({ i18nDir, notesLang }) {
	const dir = path.join(i18nDir, CONTEXT_DIR);
	const app = readMarkdown(path.join(dir, APP_FILE));
	const languages = new Map(
		app.sections.flatMap(({ names, text }) => names.map(({ name }) => [name, text])),
	);
	const scopes = readScopeFiles(dir);
	const glossary = readGlossary(path.join(dir, GLOSSARY_FILE));
	const notes = readNoteTexts(dir, notesLang);
	const context = { dir, exists: existsSync(dir), app, languages, scopes, glossary, notes };

	return {
		...context,
		contextFor: (scopeName, keyName, lang) => resolve(context, scopeName, keyName, lang),
	};
}
