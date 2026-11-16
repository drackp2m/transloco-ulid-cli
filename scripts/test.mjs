#!/usr/bin/env node
import { glob } from 'node:fs/promises';
import { relative } from 'node:path';
import { run } from 'node:test';
import { fileURLToPath } from 'node:url';

import { writeSummary } from './test-summary.mjs';

const VERSION = '1.4.0';
const LABEL = 'unit';
const SLOW_TEST_MS = 300;
const TICK_MS = 100;
const DEFAULT_PATTERNS = ['src/**/*.test.mjs'];
const FRAME = /^\s*at (?:(?<method>.+?) \()?(?<file>[^()]+?):(?<line>\d+):(?<column>\d+)\)?$/u;

const live = true === process.stdout.isTTY;

const colored =
	undefined === process.env.NO_COLOR &&
	(undefined !== process.env.FORCE_COLOR || undefined !== process.env.CI || live);

const paint = (open, close) => (text) => (colored ? `${open}${text}${close}` : `${text}`);

const c = {
	bold: paint('\x1b[1m', '\x1b[22m'),
	dim: paint('\x1b[2m', '\x1b[22m'),
	green: paint('\x1b[32m', '\x1b[39m'),
	red: paint('\x1b[31m', '\x1b[39m'),
	yellow: paint('\x1b[33m', '\x1b[39m'),
	cyan: paint('\x1b[36m', '\x1b[39m'),
	grey: paint('\x1b[90m', '\x1b[39m'),
	label: paint('\x1b[48;5;208m\x1b[30m', '\x1b[39m\x1b[49m'),
	run: paint('\x1b[1m\x1b[46m\x1b[30m', '\x1b[22m\x1b[39m\x1b[49m'),
	fail: paint('\x1b[1m\x1b[41m', '\x1b[22m\x1b[49m'),
};

const plural = (value, word) => `${value} ${word}${1 === value ? '' : 's'}`;

const split = (ms) => (1000 > ms ? [`${Math.round(ms)}`, 'ms'] : [(ms / 1000).toFixed(2), 's']);

const duration = (ms) => split(ms).join('');

function durationTag(ms) {
	const [value, unit] = split(ms);
	const tint = SLOW_TEST_MS <= ms ? c.yellow : c.green;

	return tint(`${value}${c.dim(unit)}`);
}

const args = process.argv.slice(2);

if (args.includes('--version')) {
	console.log(VERSION);
	process.exit(0);
}

const patterns = args.filter((arg) => !arg.startsWith('--'));
const globPatterns = 0 === patterns.length ? DEFAULT_PATTERNS : patterns;

const files = new Map();
const failures = [];
const started = new Date();
const startedAt = performance.now();

let liveLines = 0;
let drawn = '';

function fileState(path) {
	let state = files.get(path);

	if (undefined === state) {
		state = {
			tests: [],
			failed: 0,
			error: null,
			output: { stdout: '', stderr: '' },
			enqueued: 0,
			seen: false,
		};
		files.set(path, state);
	}

	return state;
}

function recordTest(data, ok) {
	const path = relative(process.cwd(), data.file);
	const state = fileState(path);
	const skipped = undefined !== data.skip || undefined !== data.todo;

	state.tests.push({ name: data.name, ms: data.details.duration_ms ?? 0, ok, skipped });

	if (!ok) {
		state.failed += 1;
		failures.push({ path, name: data.name, error: data.details.error });
	}
}

function recordFileError(data) {
	const path = relative(process.cwd(), data.file);

	fileState(path).error = data.details.error;
	failures.push({ path, name: null, error: data.details.error });
	printFile(path, null);
}

function printFile(path, total) {
	const state = fileState(path);

	if (undefined !== state.total) {
		return;
	}

	state.total = total;
	clearLive();

	const broken = 0 !== state.failed || null !== state.error;
	const icon = broken ? c.red('❯') : c.green('✓');
	const ms = state.tests.reduce((sum, test) => sum + test.ms, 0);

	console.log(
		` ${icon} ${c.label(` ${LABEL} `)} ${path} ${countsTag(state, total)} ${durationTag(ms)}`,
	);

	printSlowTests(state);
	printOutput(path, state);
}

function countsTag(state, total) {
	if (null === total) {
		return c.dim('(did not run)');
	}

	const failed = 0 === state.failed ? '' : `${c.dim(' | ')}${c.red(`${state.failed} failed`)}`;

	return `${c.dim('(')}${c.dim(plural(total, 'test'))}${failed}${c.dim(')')}`;
}

function printSlowTests(state) {
	for (const test of state.tests) {
		if (test.ok && !test.skipped && SLOW_TEST_MS <= test.ms) {
			console.log(`     ${c.yellow(c.dim('✓'))} ${test.name}  ${durationTag(test.ms)}`);
		}

		if (!test.ok) {
			console.log(`     ${c.red(`× ${test.name}`)}  ${durationTag(test.ms)}`);
		}
	}
}

function printOutput(path, state) {
	for (const stream of ['stdout', 'stderr']) {
		const text = state.output[stream];

		if ('' !== text) {
			console.log(c.grey(`${stream}${c.dim(` | ${path}`)}`));
			process.stdout.write(text.endsWith('\n') ? text : `${text}\n`);
		}
	}
}

function collectOutput(data, stream) {
	if (undefined === data.file) {
		clearLive();
		process.stdout.write(data.message);

		return;
	}

	fileState(relative(process.cwd(), data.file)).output[stream] += data.message;
}

const ANSI_STYLE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'gu');

const visible = (text) => text.replace(ANSI_STYLE, '').length;

function fit(text) {
	const width = process.stdout.columns ?? 80;
	const over = visible(text) - width;

	return 0 >= over ? text : `${text.slice(0, text.length - over - 1)}…`;
}

function divider(text, tint = (value) => value, right) {
	const columns = process.stdout.columns ?? 80;
	const width = visible(text);
	const head = undefined === right ? Math.floor((columns - width) / 2) : columns - width - right;
	const tail = undefined === right ? columns - width - Math.max(0, head) : right;
	const dashes = (count) => (0 >= count ? '' : tint('⎯'.repeat(count)));

	return `${dashes(head)}${text}${dashes(tail)}`;
}

function runningRow(path, state) {
	const progress = 0 === state.enqueued ? '[queued]' : `${state.tests.length}/${state.enqueued}`;

	return fit(` ${c.yellow('❯')} ${c.label(` ${LABEL} `)} ${path} ${c.dim(progress)}`);
}

function counters() {
	const states = [...files.values()];
	const done = states.filter((state) => undefined !== state.total);
	const passedFiles = done.filter((state) => 0 === state.failed && null === state.error).length;
	const tests = states.reduce(
		(sum, state) => sum + Math.max(state.enqueued, state.tests.length),
		0,
	);
	const failed = states.reduce((sum, state) => sum + state.failed, 0);
	const passed = states.reduce((sum, state) => sum + state.tests.length, 0) - failed;

	return { passedFiles, failedFiles: done.length - passedFiles, tests, passed, failed };
}

function liveBlock() {
	const running = [...files.entries()]
		.filter(([, state]) => state.seen && undefined === state.total)
		.map(([path, state]) => runningRow(path, state));
	const totals = counters();
	const rows = [
		`${label('Test Files')}  ${fileTally(totals)}`,
		`${label('Tests')}  ${liveTally(totals)}`,
		`${label('Start at')}  ${started.toTimeString().slice(0, 8)}`,
		`${label('Duration')}  ${duration(performance.now() - startedAt)}`,
	];

	return ['', ...running, '', ...rows].join('\n');
}

function clearLive() {
	if (0 === liveLines) {
		return;
	}

	process.stdout.write(`\x1b[${liveLines}A\x1b[0J`);
	liveLines = 0;
}

function drawLive() {
	if (!live) {
		return;
	}

	const block = liveBlock();

	drawn = block;
	process.stdout.write(`${block}\n`);
	liveLines = block.split('\n').length;
}

function refreshLive() {
	if (!live) {
		return;
	}

	if (0 === liveLines || drawn !== liveBlock()) {
		clearLive();
		drawLive();
	}
}

function printFailures() {
	if (0 === failures.length) {
		return;
	}

	console.log(`\n${divider(c.fail(` Failed Tests ${failures.length} `), c.red)}\n`);

	failures.forEach((failure, index) => {
		const name = null === failure.name ? '' : `${c.dim(' > ')}${failure.name}`;

		console.log(`${c.fail(' FAIL ')} ${c.label(` ${LABEL} `)} ${failure.path}${name}`);
		printErrorBody(failure.error);
		console.log(`${c.red(c.dim(divider(`[${index + 1}/${failures.length}]`, undefined, 1)))}\n`);
	});
}

function printErrorBody(error) {
	const cause =
		'ERR_TEST_FAILURE' === error?.code && error.cause instanceof Error ? error.cause : error;

	if (undefined === cause || null === cause) {
		console.log(`${c.red('The test failed without an error.')}\n`);

		return;
	}

	const message = String(cause.message ?? cause);

	if ('test failed' === message) {
		console.log(`${c.red('The file did not run — see its output above.')}\n`);

		return;
	}

	console.log(c.red(`${c.bold(String(cause.name ?? 'Error'))}: ${message}`));
	printStack(String(cause.stack ?? ''));
}

function printStack(stack) {
	const frames = stackFrames(stack);
	const nearest = frames.find(
		(frame) => !frame.file.startsWith('..') && !frame.file.includes('node_modules'),
	);
	const rest = stack.split('\n').slice(1).join('\n');

	if (0 === frames.length && '' !== rest.trim()) {
		console.log(c.grey(rest));
	}

	for (const frame of frames) {
		console.log(frameLine(frame, nearest));
	}

	console.log('');
}

function stackFrames(stack) {
	return stack
		.split('\n')
		.map((line) => FRAME.exec(line)?.groups)
		.filter((frame) => undefined !== frame && !frame.file.startsWith('node:'))
		.map((frame) => ({ ...frame, file: framePath(frame.file) }));
}

function frameLine(frame, nearest) {
	const tint = frame === nearest ? c.cyan : c.grey;
	const at = `${frame.file}:${c.dim(`${frame.line}:${frame.column}`)}`;

	return tint(` ${c.dim('❯')} ${undefined === frame.method ? at : `${frame.method} ${at}`}`);
}

const framePath = (file) =>
	relative(process.cwd(), file.startsWith('file://') ? fileURLToPath(file) : file);

const label = (text) => c.dim(text.padStart(11));

const fileTally = (totals) =>
	tally({ passed: totals.passedFiles, failed: totals.failedFiles, total: files.size });

const liveTally = (totals) =>
	tally({ passed: totals.passed, failed: totals.failed, total: totals.tests });

function printSummary(counts) {
	const totals = counters();

	console.log('');
	console.log(`${label('Test Files')}  ${fileTally(totals)}`);
	console.log(`${label('Tests')}  ${testTally(counts)}`);
	console.log(`${label('Start at')}  ${started.toTimeString().slice(0, 8)}`);
	console.log(`${label('Duration')}  ${elapsed()}`);
	console.log('');
}

function testTally(counts) {
	return tally({
		passed: counts.passed - counts.skipped - counts.todo,
		failed: counts.failed,
		total: counts.tests,
		skipped: counts.skipped,
		todo: counts.todo,
	});
}

function tally({ passed, failed, total, skipped = 0, todo = 0 }) {
	if (0 === total) {
		return c.dim('no tests');
	}

	const parts = [
		0 === failed ? null : c.bold(c.red(`${failed} failed`)),
		0 === passed ? null : c.bold(c.green(`${passed} passed`)),
		0 === skipped ? null : c.yellow(`${skipped} skipped`),
		0 === todo ? null : c.grey(`${todo} todo`),
	].filter((part) => null !== part);

	return `${parts.join(c.dim(' | '))}${c.grey(` (${total})`)}`;
}

function elapsed() {
	const total = performance.now() - startedAt;
	const inTests = [...files.values()]
		.flatMap((state) => state.tests)
		.reduce((sum, test) => sum + test.ms, 0);

	return `${duration(total)} ${c.dim(`(tests ${duration(inTests)})`)}`;
}

function trackEvent(event, data) {
	const path = undefined === data.file ? null : relative(process.cwd(), data.file);

	if (null !== path && ('test:start' === event.type || data.name === path)) {
		fileState(path).seen = 'test:enqueue' !== event.type;
	}

	if ('test:enqueue' === event.type && null !== path && 1 <= data.nesting) {
		fileState(path).enqueued += 1;
	}

	if (('test:pass' === event.type || 'test:fail' === event.type) && null !== path) {
		trackResult(event, data, path);
	}
}

function trackResult(event, data, path) {
	const ok = 'test:pass' === event.type;

	if ('suite' === data.details.type) {
		if (1 <= data.nesting) {
			fileState(path).enqueued -= 1;
		}

		return;
	}

	if (!ok && data.name === path) {
		recordFileError(data);

		return;
	}

	recordTest(data, ok);
}

for (const path of (await Array.fromAsync(glob(globPatterns))).sort()) {
	fileState(path);
}

console.log(`\n${c.run(' RUN ')} ${c.cyan(`v${VERSION}`)} ${c.grey(process.cwd())}\n`);

const ticker = live ? setInterval(refreshLive, TICK_MS).unref() : null;

let totals = { tests: 0, passed: 0, failed: 0, skipped: 0, todo: 0 };

refreshLive();

for await (const event of run({ files: [...files.keys()], concurrency: true })) {
	const data = event.data;

	trackEvent(event, data);

	if ('test:summary' === event.type && undefined !== data.file) {
		printFile(relative(process.cwd(), data.file), data.counts.tests);
	}

	if ('test:summary' === event.type && undefined === data.file) {
		totals = data.counts;
	}

	if ('test:stderr' === event.type || 'test:stdout' === event.type) {
		collectOutput(data, 'test:stdout' === event.type ? 'stdout' : 'stderr');
	}

	refreshLive();
}

if (null !== ticker) {
	clearInterval(ticker);
}

clearLive();
printFailures();
printSummary(totals);
writeSummary({ files, failures, totals, ms: performance.now() - startedAt });

process.exitCode = 0 === failures.length ? 0 : 1;
