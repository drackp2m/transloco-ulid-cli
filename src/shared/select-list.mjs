import readline from 'node:readline';

import {
	DEFAULT_LABELS,
	createSelection,
	linesOf,
	paintedOf,
	pressKey,
	resize,
} from './select-state.mjs';

const terminal = () => ({ rows: process.stdout.rows, columns: process.stdout.columns });

function draw(state) {
	resize(state, terminal());

	const lines = linesOf(state);
	const up = Math.min(state.painted, state.size.rows - 1);

	if (0 !== up) {
		process.stdout.write(`\x1b[${up}A\x1b[0J`);
	}

	process.stdout.write(`${lines.join('\n')}\n`);
	state.painted = paintedOf(lines, state.size.columns);
}

export function selectFromList(files, preselected, labels = DEFAULT_LABELS) {
	const state = createSelection({ files, preselected, labels, size: terminal() });

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
		const listener = (sequence, key) => {
			const outcome = pressKey(state, sequence, key);

			if (outcome.done) {
				finish(outcome.result);
			} else {
				draw(state);
			}
		};

		process.stdin.on('keypress', listener);
		process.stdout.on('resize', onResize);
	});
}
