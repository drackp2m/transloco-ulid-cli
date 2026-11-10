import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const DEFAULT_NOTES_LANG = 'en';

export const NOTES_TEMPLATE = 'src/catalogue/notes.en.json';

export const NOTE_TEXTS = JSON.parse(
	readFileSync(new URL('./notes.en.json', import.meta.url), 'utf8'),
);

export const notesFileName = (lang) => `notes.${lang}.json`;

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
		return [{ type: 'bad-note-text', message: `"${key}" is missing` }];
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
		`notesLang is "${lang}" and there is no such file: translate the English template, ` +
		`${NOTES_TEMPLATE} in @drackp2m/transloco-ulid-cli`,
});

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

	const problems = noteTextProblems(data, source);
	const usable = problems.every(({ type }) => 'unknown-note-text' === type);

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

	const reasons = notes.problems.map(({ message }) => message).join('; ');

	throw new Error(`${notes.file}: ${reasons}`);
}
