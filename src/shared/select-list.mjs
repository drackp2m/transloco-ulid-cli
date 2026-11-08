import readline from 'node:readline';

import { c, plural } from './terminal.mjs';

const CHROME = 6;
const MIN_VIEWPORT = 3;
const MIN_COLUMNS = 24;
const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
const HINTS = [
	[
		'↑↓ move',
		'space toggle',
		'ctrl+a all',
		'ctrl+r none',
		'type to filter',
		'enter save',
		'esc cancel',
	],
	['↑↓ move', 'space toggle', 'ctrl+a/r all/none', 'enter save', 'esc cancel'],
	['↑↓', 'space', 'enter', 'esc'],
];

const DEFAULT_LABELS = {
	title: 'Select the test files to lock',
	shortTitle: 'Select files',
	noun: 'file',
};

export const terminal = () => ({
	rows: Math.max(MIN_VIEWPORT + CHROME, process.stdout.rows ?? 24),
	columns: Math.max(MIN_COLUMNS, process.stdout.columns ?? 80),
});

const viewportOf = (size) => size.rows - CHROME;

const plainWidth = (line) => line.replace(ANSI_PATTERN, '').length;

const clip = (text, width) =>
	text.length <= width ? text : `…${text.slice(text.length - width + 1)}`;

const matching = (files, filter) =>
	'' === filter ? files : files.filter((file) => file.toLowerCase().includes(filter));

function clamp(state) {
	const viewport = viewportOf(state.size);
	const last = Math.max(0, state.filtered.length - 1);
	const maxOffset = Math.max(0, state.filtered.length - viewport);

	state.cursor = Math.max(0, Math.min(state.cursor, last));
	state.offset = Math.max(state.cursor - viewport + 1, Math.min(state.offset, state.cursor));
	state.offset = Math.max(0, Math.min(state.offset, maxOffset));
}

function refilter(state) {
	state.filtered = matching(state.files, state.filter.toLowerCase());
	state.cursor = 0;
	state.offset = 0;
	clamp(state);
}

function rowOf(state, file, index) {
	const active = state.offset + index === state.cursor;
	const mark = state.marked.has(file) ? `${c.green}◉${c.reset}` : `${c.dim}◯${c.reset}`;
	const arrow = active ? `${c.cyan}❯${c.reset}` : ' ';
	const text = clip(file, state.size.columns - 6);
	const label = active ? `${c.cyan}${text}${c.reset}` : text;

	return `  ${arrow} ${mark} ${label}`;
}

function titleOf(state) {
	const counts = `${plural(state.filtered.length, state.noun)} · ${state.marked.size} selected`;
	const { title: long, shortTitle } = state.labels;
	const title = long.length + counts.length + 4 <= state.size.columns ? long : shortTitle;

	return `${c.bold}${title}${c.reset} ${c.dim}(${counts})${c.reset}`;
}

function headerOf(state) {
	const room = state.size.columns - plainWidth(titleOf(state)) - 10;
	const filter =
		'' === state.filter || 8 > room
			? ''
			: `  ${c.dim}filter:${c.reset} ${clip(state.filter, room)}`;

	return [`${titleOf(state)}${filter}`, ''];
}

function hintsOf(columns) {
	const fitting = HINTS.find((hints) => hints.join(' · ').length + 2 <= columns);

	return `  ${c.dim}${(fitting ?? HINTS.at(-1)).join(' · ')}${c.reset}`;
}

function footerOf(state) {
	const shown = Math.min(viewportOf(state.size), state.filtered.length);
	const range = `${state.offset + shown}/${state.filtered.length}`;
	const empty = 0 === state.filtered.length ? `  ${c.yellow}⚠ nothing matches${c.reset}` : '';

	return ['', empty || `  ${c.dim}${range}${c.reset}`, hintsOf(state.size.columns)];
}

function linesOf(state) {
	const rows = state.filtered
		.slice(state.offset, state.offset + viewportOf(state.size))
		.map((file, index) => rowOf(state, file, index));

	return [...headerOf(state), ...rows, ...footerOf(state)];
}

const paintedOf = (lines, columns) =>
	lines.reduce((total, line) => total + Math.max(1, Math.ceil(plainWidth(line) / columns)), 0);

function draw(state) {
	state.size = terminal();
	clamp(state);

	const lines = linesOf(state);

	const up = Math.min(state.painted, state.size.rows - 1);

	if (0 !== up) {
		process.stdout.write(`\x1b[${up}A\x1b[0J`);
	}

	process.stdout.write(`${lines.join('\n')}\n`);
	state.painted = paintedOf(lines, state.size.columns);
}

const toggle = (state) => {
	const file = state.filtered[state.cursor];

	if (undefined !== file) {
		state.marked[state.marked.has(file) ? 'delete' : 'add'](file);
	}
};

function onControl(state, key) {
	if ('a' === key.name) {
		state.filtered.forEach((file) => state.marked.add(file));
	} else if ('r' === key.name) {
		state.filtered.forEach((file) => state.marked.delete(file));
	}
}

function onNavigation(state, key) {
	const page = viewportOf(state.size);
	const step = { up: -1, down: 1, pageup: -page, pagedown: page }[key.name];

	if (undefined !== step) {
		state.cursor += step;
	} else if ('home' === key.name) {
		state.cursor = 0;
	} else if ('end' === key.name) {
		state.cursor = state.filtered.length - 1;
	}
}

function onTyping(state, sequence, key) {
	if ('backspace' === key.name) {
		state.filter = state.filter.slice(0, -1);
		refilter(state);
	} else if (1 === sequence?.length && 31 < sequence.codePointAt(0) && !key.ctrl && !key.meta) {
		state.filter += sequence;
		refilter(state);
	}
}

function onKey(state, sequence, key, done) {
	if (key.ctrl && 'c' === key.name) {
		return done(null);
	}

	if ('escape' === key.name) {
		return done(null);
	}

	if ('return' === key.name) {
		return done([...state.marked]);
	}

	if ('space' === key.name) {
		toggle(state);
	} else if (key.ctrl) {
		onControl(state, key);
	} else {
		onNavigation(state, key);
		onTyping(state, sequence, key);
	}

	draw(state);

	return undefined;
}

const initialState = (files, preselected, labels) => ({
	files,
	filtered: files,
	labels,
	noun: labels.noun,
	marked: new Set(preselected.filter((file) => files.includes(file))),
	filter: '',
	cursor: 0,
	offset: 0,
	painted: 0,
	size: terminal(),
});

export function selectFromList(files, preselected, labels = DEFAULT_LABELS) {
	const state = initialState(files, preselected, { ...DEFAULT_LABELS, ...labels });

	readline.emitKeypressEvents(process.stdin);
	process.stdin.setRawMode(true);
	process.stdin.resume();
	process.stdout.write('\x1b[?25l');
	draw(state);

	return new Promise((resolve) => {
		const onResize = () => draw(state);
		const finish = (result) => {
			process.stdin.off('keypress', listener);
			process.stdout.off('resize', onResize);
			process.stdin.setRawMode(false);
			process.stdin.pause();
			process.stdout.write('\x1b[?25h');
			resolve(result);
		};
		const listener = (sequence, key) => onKey(state, sequence, key, finish);

		process.stdin.on('keypress', listener);
		process.stdout.on('resize', onResize);
	});
}
