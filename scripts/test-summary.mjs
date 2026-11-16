import { appendFileSync } from 'node:fs';

const SLOW_TEST_MS = 300;
const ERROR_LINES = 30;
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'gu');

const plain = (text) => String(text).replace(ANSI, '');

const plural = (value, word) => `${value} ${word}${1 === value ? '' : 's'}`;

const timeOf = (ms) => (1000 > ms ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`);

const escaped = (text) =>
	plain(text).replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');

const cell = (text) => escaped(text).replace(/\|/gu, '\\|');

const broken = (state) => 0 !== state.failed || null !== state.error;

function verdictOf(totals, ms) {
	if (0 === totals.tests) {
		return '> ⚠️ No test ran.';
	}

	return 0 === totals.failed
		? `> ✅ ${plural(totals.tests, 'test')} passed in ${timeOf(ms)}.`
		: `> ❌ ${totals.failed} of ${plural(totals.tests, 'test')} failed in ${timeOf(ms)}.`;
}

function tableOf(files, totals) {
	const states = [...files.values()];
	const failedFiles = states.filter(broken).length;
	const skipped = totals.skipped + totals.todo;
	const passed = totals.passed - skipped;

	return [
		'| | Passed | Failed | Skipped | Total |',
		'| --- | ---: | ---: | ---: | ---: |',
		`| Test files | ${states.length - failedFiles} | ${failedFiles} | — | ${states.length} |`,
		`| Tests | ${passed} | ${totals.failed} | ${skipped} | ${totals.tests} |`,
	];
}

function errorText(error) {
	const cause =
		'ERR_TEST_FAILURE' === error?.code && error.cause instanceof Error ? error.cause : error;

	if (undefined === cause || null === cause) {
		return 'The test failed without an error.';
	}

	const message = plain(cause.message ?? cause);

	if ('test failed' === message) {
		return 'The file did not run — see the step log.';
	}

	const text = `${cause.name ?? 'Error'}: ${message}`;

	return text.split('\n').slice(0, ERROR_LINES).join('\n');
}

function failureOf({ path, name, error }) {
	const title = null === name ? `<code>${path}</code>` : `<code>${path}</code> › ${escaped(name)}`;

	return [
		'<details>',
		`<summary>${title}</summary>`,
		'',
		'````text',
		errorText(error),
		'````',
		'',
		'</details>',
	];
}

function failuresOf(failures) {
	return 0 === failures.length ? [] : ['', '### Failed tests', '', ...failures.flatMap(failureOf)];
}

function slowOf(files) {
	const slow = [...files]
		.flatMap(([path, state]) =>
			state.tests
				.filter((test) => test.ok && !test.skipped && SLOW_TEST_MS <= test.ms)
				.map((test) => ({ path, ...test })),
		)
		.sort((left, right) => right.ms - left.ms);

	if (0 === slow.length) {
		return [];
	}

	return [
		'',
		`<details><summary>${plural(slow.length, 'slow test')} (${SLOW_TEST_MS} ms or more)</summary>`,
		'',
		'| File | Test | Duration |',
		'| --- | --- | ---: |',
		...slow.map((test) => `| \`${test.path}\` | ${cell(test.name)} | ${timeOf(test.ms)} |`),
		'',
		'</details>',
	];
}

export function writeSummary({ files, failures, totals, ms }) {
	const file = process.env.GITHUB_STEP_SUMMARY ?? '';

	if ('' === file) {
		return;
	}

	const lines = [
		`## Tests · Node ${process.version}`,
		'',
		verdictOf(totals, ms),
		'',
		...tableOf(files, totals),
		...failuresOf(failures),
		...slowOf(files),
	];

	try {
		appendFileSync(file, `${lines.join('\n')}\n`);
	} catch (error) {
		console.error(`Could not write the job summary: ${error.message}`);
	}
}
