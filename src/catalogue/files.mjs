import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

let unsaved = new Map();

// Every file the analysis reads goes through here, so an editor can hand over the text it
// holds and has not saved yet and get the answer the disk would give once it is. The texts
// only stand while `run` does: the commands never pass any and always read the disk.
export function withTexts(texts, run) {
	const previous = unsaved;

	unsaved = new Map([...texts].map(([file, text]) => [path.resolve(file), text]));

	try {
		return run();
	} finally {
		unsaved = previous;
	}
}

export const fileExists = (file) => unsaved.has(path.resolve(file)) || existsSync(file);

export const readText = (file) => unsaved.get(path.resolve(file)) ?? readFileSync(file, 'utf8');
