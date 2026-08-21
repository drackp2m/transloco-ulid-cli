import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export const CONTEXT_DIR = 'context';
export const APP_FILE = 'app.md';
export const GLOSSARY_FILE = 'glossary.json';

const HEADING = /^##\s+(.+?)\s*$/;
const TITLE = /^#\s/;

const textOf = (lines) => lines.join('\n').trim();

// A heading is either a constant name (SYNC_ROWS) or a group pattern
// (SYNC_*); everything else in the line is literal.
const isGroup = (heading) => heading.includes('*');

const patternOf = (heading) => {
	const escaped = heading.replace(/[.+?^${}()|[\]\\]/g, (char) => `\\${char}`);

	return new RegExp(`^${escaped.replaceAll('*', '[A-Z0-9_]*')}$`);
};

export const matchesKey = (heading, name) => patternOf(heading).test(name);

function parseSections(text) {
	const intro = [];
	const sections = [];
	let current = null;

	text.split('\n').forEach((line, index) => {
		const [, heading] = HEADING.exec(line) ?? [];

		if (undefined !== heading) {
			current = { heading, line: index + 1, lines: [] };
			sections.push(current);
		} else if (!TITLE.test(line)) {
			(current?.lines ?? intro).push(line);
		}
	});

	return { intro: textOf(intro), sections: share(sections) };
}

// Headings stacked with nothing between them all describe the paragraph that
// follows, so writing "## A" over "## B" over one body says it once for both.
function share(sections) {
	const resolved = sections.map(({ heading, line, lines }) => ({
		heading,
		line,
		group: isGroup(heading),
		text: textOf(lines),
	}));

	for (let index = resolved.length - 2; 0 <= index; index -= 1) {
		if ('' === resolved[index].text) {
			resolved[index].text = resolved[index + 1].text;
		}
	}

	return resolved;
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

// General to specific, accumulating: app → language → scope → group → key. A
// layer with nothing written for it simply drops out.
function resolve({ app, languages, scopes }, scopeName, keyName, lang) {
	const scope = scopes.get(scopeName);
	const matching = (scope?.sections ?? [])
		.filter((section) => matchesKey(section.heading, keyName ?? ''))
		.sort((left, right) => Number(right.group) - Number(left.group));

	return [
		{ level: 'app', text: app.intro },
		{ level: 'language', text: languages.get(lang) ?? '' },
		{ level: 'scope', text: scope?.intro ?? '' },
		...matching.map((section) => ({
			level: section.group ? 'group' : 'key',
			heading: section.heading,
			text: section.text,
		})),
	].filter((layer) => '' !== layer.text);
}

const patterns = new Map();

// A glossary term is a hint for whoever translates, not a rule to enforce, so
// it matches whole words case-insensitively and tolerates the plural: a source
// saying "jugadas" still pulls in "jugada".
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

export function readContext({ i18nDir }) {
	const dir = path.join(i18nDir, CONTEXT_DIR);
	const app = readMarkdown(path.join(dir, APP_FILE));
	const languages = new Map(app.sections.map((section) => [section.heading, section.text]));
	const scopes = readScopeFiles(dir);
	const glossary = readGlossary(path.join(dir, GLOSSARY_FILE));
	const context = { dir, exists: existsSync(dir), app, languages, scopes, glossary };

	return {
		...context,
		contextFor: (scopeName, keyName, lang) => resolve(context, scopeName, keyName, lang),
	};
}
