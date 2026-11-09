import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createSelection, fitSize, linesOf, paintedOf, pressKey } from './select-state.mjs';

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
const FILES = ['auth · LOG_IN', 'auth · LOG_OUT', 'common · SAVE', 'common · DELETE', 'match · RESIGN'];
const LABELS = { title: 'Pick the keys to add', shortTitle: 'Add keys', noun: 'key' };
const WIDE = { rows: 12, columns: 80 };

const select = (options = {}) => createSelection({ files: FILES, labels: LABELS, size: WIDE, ...options });

const press = (state, name, extra = {}) => pressKey(state, extra.sequence, { name, ...extra });

const type = (state, text) => {
	for (const char of text) {
		pressKey(state, char, { name: char.toLowerCase() });
	}
};

const screen = (state) => linesOf(state).map((line) => line.replace(ANSI, ''));

const many = (count) => Array.from({ length: count }, (_, index) => `file-${String(index).padStart(2, '0')}`);

describe('createSelection', () => {
	test('keeps the preselected entries that are on the list, and drops the rest', () => {
		deepStrictEqual([...select({ preselected: ['common · SAVE', 'gone'] }).marked], ['common · SAVE']);
	});

	test('keeps the terminal size within what the list can be drawn in', () => {
		deepStrictEqual(fitSize({}), { rows: 24, columns: 80 });
		deepStrictEqual(fitSize({ rows: 2, columns: 5 }), { rows: 9, columns: 24 });
	});
});

describe('pressKey — choosing', () => {
	test('toggles the entry under the cursor with space', () => {
		const state = select();

		press(state, 'space');
		deepStrictEqual([...state.marked], ['auth · LOG_IN']);
		press(state, 'space');
		deepStrictEqual([...state.marked], []);
	});

	test('returns the marked entries on enter, in the order they were marked', () => {
		const state = select({ preselected: ['common · SAVE'] });

		press(state, 'space');

		deepStrictEqual(press(state, 'return'), {
			done: true,
			result: ['common · SAVE', 'auth · LOG_IN'],
		});
	});

	test('cancels with nothing on escape and on ctrl+c', () => {
		deepStrictEqual(press(select(), 'escape'), { done: true, result: null });
		deepStrictEqual(press(select(), 'c', { ctrl: true }), { done: true, result: null });
	});

	test('marks and unmarks only what the filter shows', () => {
		const state = select({ preselected: ['auth · LOG_IN'] });

		type(state, 'co');
		press(state, 'a', { ctrl: true });
		deepStrictEqual([...state.marked], ['auth · LOG_IN', 'common · SAVE', 'common · DELETE']);
		press(state, 'r', { ctrl: true });
		deepStrictEqual([...state.marked], ['auth · LOG_IN']);
	});

	test('keeps going until enter or escape', () => {
		deepStrictEqual(press(select(), 'down'), { done: false });
	});
});

describe('pressKey — filtering', () => {
	test('filters as you type, ignoring case, and puts the cursor back on top', () => {
		const state = select();

		press(state, 'end');
		type(state, 'CO');

		deepStrictEqual(state.filtered, ['common · SAVE', 'common · DELETE']);
		strictEqual(state.cursor, 0);
	});

	test('widens the filter again on backspace', () => {
		const state = select();

		type(state, 'co');
		press(state, 'backspace');
		press(state, 'backspace');

		strictEqual(state.filter, '');
		strictEqual(state.filtered.length, FILES.length);
	});

	test('takes no text from a key typed with meta', () => {
		const state = select();

		press(state, 'a', { sequence: 'a', meta: true });

		strictEqual(state.filter, '');
	});
});

describe('pressKey — moving', () => {
	test('stops at both ends of the list', () => {
		const state = select();

		press(state, 'up');
		strictEqual(state.cursor, 0);
		press(state, 'end');
		strictEqual(state.cursor, 4);
		press(state, 'down');
		strictEqual(state.cursor, 4);
		press(state, 'home');
		strictEqual(state.cursor, 0);
	});

	test('moves a whole page, and scrolls to keep the cursor in sight', () => {
		const state = createSelection({ files: many(20), size: { rows: 10, columns: 80 } });

		press(state, 'pagedown');
		deepStrictEqual([state.cursor, state.offset], [4, 1]);
		press(state, 'end');
		deepStrictEqual([state.cursor, state.offset], [19, 16]);
	});
});

describe('linesOf', () => {
	test('draws the title with its counts, a row per entry and where the view stands', () => {
		deepStrictEqual(screen(select({ preselected: ['common · SAVE'] })), [
			'Pick the keys to add (5 keys · 1 selected)',
			'',
			'  ❯ ◯ auth · LOG_IN',
			'    ◯ auth · LOG_OUT',
			'    ◉ common · SAVE',
			'    ◯ common · DELETE',
			'    ◯ match · RESIGN',
			'',
			'  5/5',
			'  ↑↓ move · space toggle · ctrl+a/r all/none · enter save · esc cancel',
		]);
	});

	test('shows only the rows that fit, from the one the view starts at', () => {
		const state = createSelection({ files: many(20), size: { rows: 10, columns: 80 } });

		press(state, 'end');

		deepStrictEqual(screen(state).slice(2, 8), [
			'    ◯ file-16',
			'    ◯ file-17',
			'    ◯ file-18',
			'  ❯ ◯ file-19',
			'',
			'  20/20',
		]);
	});

	test('falls back to the short title and the short hints in a narrow terminal', () => {
		const lines = screen(select({ size: { rows: 12, columns: 30 } }));

		strictEqual(lines[0], 'Add keys (5 keys · 0 selected)');
		strictEqual(lines.at(-1), '  ↑↓ · space · enter · esc');
	});

	test('clips a long entry from the left, keeping its end', () => {
		const files = ['a/very/long/path/to/some/deeply/nested/file.test.mjs'];

		strictEqual(screen(createSelection({ files, size: { rows: 12, columns: 30 } }))[2], '  ❯ ◯ …ly/nested/file.test.mjs');
	});

	test('shows the filter, and says so when it matches nothing', () => {
		const state = select();

		type(state, 'xy');

		deepStrictEqual(screen(state).slice(0, 4), [
			'Pick the keys to add (0 keys · 0 selected)  filter: xy',
			'',
			'',
			'  ⚠ nothing matches',
		]);
	});
});

describe('paintedOf', () => {
	test('counts the terminal rows the lines take, wrapping included', () => {
		strictEqual(paintedOf(['abc', '', 'x'.repeat(50)], 24), 5);
	});
});
