import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { CONTEXT_DIR } from '../catalogue/context.mjs';
import { NOTE_TEXTS, notesFileName } from '../catalogue/note-texts.mjs';

const json = (data) => `${JSON.stringify(data, null, '\t')}\n`;

const isObject = (data) => null !== data && 'object' === typeof data && !Array.isArray(data);

function readExisting(file) {
	try {
		const data = JSON.parse(readFileSync(file, 'utf8'));

		return isObject(data) ? { data } : { problem: `${file} is not a JSON object` };
	} catch (error) {
		return { problem: `${file} is not valid JSON: ${error.message}` };
	}
}

function merged(data) {
	const known = Object.keys(NOTE_TEXTS).map((key) => [key, data[key] ?? NOTE_TEXTS[key]]);
	const unknown = Object.entries(data).filter(([key]) => !(key in NOTE_TEXTS));

	return Object.fromEntries([...known, ...unknown]);
}

export function planNotes({ i18nDir, lang }) {
	const file = path.join(i18nDir, CONTEXT_DIR, notesFileName(lang));

	if (!existsSync(file)) {
		return { file, created: true, added: Object.keys(NOTE_TEXTS), content: json(NOTE_TEXTS) };
	}

	const { data, problem } = readExisting(file);

	if (undefined !== problem) {
		return { file, problem };
	}

	const added = Object.keys(NOTE_TEXTS).filter((key) => !(key in data));

	return { file, created: false, added, content: 0 === added.length ? null : json(merged(data)) };
}
