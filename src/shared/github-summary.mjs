import { appendFileSync } from 'node:fs';

export function inStepSummary() {
	return undefined !== process.env['GITHUB_STEP_SUMMARY'];
}

export function writeStepSummary(markdown) {
	const file = process.env['GITHUB_STEP_SUMMARY'];

	if (undefined === file) {
		return;
	}

	appendFileSync(file, markdown.endsWith('\n') ? markdown : markdown + '\n');
}
