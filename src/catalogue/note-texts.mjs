import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const DEFAULT_NOTES_LANG = 'en';

export const NOTE_TEXTS = JSON.parse(
	readFileSync(new URL('./notes.en.json', import.meta.url), 'utf8'),
);

export const notesFileName = (lang) => `notes.${lang}.json`;

const NOTES_COMMAND = '"transloco-ulid notes"';

const PLACEHOLDER = /\{(\w+)\}/g;

const placeholdersOf = (text) => new Set([...text.matchAll(PLACEHOLDER)].map(([, name]) => name));

export const fillNote = (text, values) =>
	text.replace(PLACEHOLDER, (match, name) => values[name] ?? match);

const lineOf = (source, key) => {
	const line = source.split('\n').findIndex((content) => content.includes(`"${key}"`));

	return -1 === line ? {} : { line: line + 1, col: 1 };
};

function placeholderProblems(key, text, source) {
	const wanted = placeholdersOf(NOTE_TEXTS[key]);
	const written = placeholdersOf(text);
	const at = lineOf(source, key);

	return [
		...[...wanted]
			.filter((name) => !written.has(name))
			.map((name) => ({ type: 'bad-note-text', message: `"${key}" drops {${name}}`, ...at })),
		...[...written]
			.filter((name) => !wanted.has(name))
			.map((name) => ({
				type: 'bad-note-text',
				message: `"${key}" has {${name}}, which the template does not`,
				...at,
			})),
	];
}

function textProblems(key, data, source) {
	const text = data[key];

	if (undefined === text) {
		return [{ type: 'bad-note-text', message: `"${key}" is missing — ${NOTES_COMMAND} adds it` }];
	}

	if ('string' !== typeof text || '' === text.trim()) {
		const what = 'string' === typeof text ? 'is empty' : 'is not a text';

		return [{ type: 'bad-note-text', message: `"${key}" ${what}`, ...lineOf(source, key) }];
	}

	return placeholderProblems(key, text, source);
}

export function noteTextProblems(data, source = '') {
	if (null === data || 'object' !== typeof data || Array.isArray(data)) {
		return [{ type: 'bad-note-text', message: 'the file is not a JSON object' }];
	}

	const unknown = Object.keys(data)
		.filter((key) => !(key in NOTE_TEXTS))
		.map((key) => ({
			type: 'unknown-note-text',
			message: `"${key}" is not in the template`,
			...lineOf(source, key),
		}));

	return [...Object.keys(NOTE_TEXTS).flatMap((key) => textProblems(key, data, source)), ...unknown];
}

const missingFile = (lang) => ({
	type: 'missing-notes-file',
	message:
		`notesLang is "${lang}" and there is no such file — ${NOTES_COMMAND} writes it from the ` +
		'English template',
});

export const quotedList = (names) => {
	const quoted = names.map((name) => `"${name}"`);

	return 1 === quoted.length ? quoted[0] : `${quoted.slice(0, -1).join(', ')} and ${quoted.at(-1)}`;
};

const SAME_IN_EVERY_LANGUAGE = new Set(['decimalPoint']);

export function untranslatedKeysOf(data) {
	return Object.keys(NOTE_TEXTS).filter(
		(key) => !SAME_IN_EVERY_LANGUAGE.has(key) && NOTE_TEXTS[key] === data?.[key],
	);
}

function untranslatedProblems(data, source, lang) {
	const keys = DEFAULT_NOTES_LANG === lang ? [] : untranslatedKeysOf(data);

	if (0 === keys.length) {
		return [];
	}

	const everything = Object.keys(NOTE_TEXTS).length - SAME_IN_EVERY_LANGUAGE.size === keys.length;
	const message = everything
		? 'nothing translated yet: every text is still the English template'
		: `left to translate: ${quotedList(keys)}`;

	return [{ type: 'untranslated-note-text', message, ...lineOf(source, keys[0]) }];
}

const WARNINGS = new Set(['unknown-note-text', 'untranslated-note-text']);

export const isNotesWarning = ({ type }) => WARNINGS.has(type);

const templateKeysOf = (data) =>
	Object.fromEntries(Object.keys(NOTE_TEXTS).map((key) => [key, data[key]]));

function parsed(file, lang) {
	const source = readFileSync(file, 'utf8');
	let data;

	try {
		data = JSON.parse(source);
	} catch (error) {
		const problems = [{ type: 'invalid-json', message: error.message }];

		return { file, lang, exists: true, texts: null, problems };
	}

	const problems = [...noteTextProblems(data, source), ...untranslatedProblems(data, source, lang)];
	const usable = problems.every(isNotesWarning);

	return { file, lang, exists: true, texts: usable ? templateKeysOf(data) : null, problems };
}

export function readNoteTexts(contextDir, lang = DEFAULT_NOTES_LANG) {
	const file = path.join(contextDir, notesFileName(lang));

	if (existsSync(file)) {
		return parsed(file, lang);
	}

	const fallback = DEFAULT_NOTES_LANG === lang;

	return {
		file,
		lang,
		exists: false,
		texts: fallback ? NOTE_TEXTS : null,
		problems: fallback ? [] : [missingFile(lang)],
	};
}

export function usableNoteTexts(notes) {
	if (null !== notes.texts) {
		return notes.texts;
	}

	const reasons = notes.problems
		.filter((problem) => !isNotesWarning(problem))
		.map(({ message }) => message)
		.join('; ');

	throw new Error(`${notes.file}: ${reasons}`);
}
