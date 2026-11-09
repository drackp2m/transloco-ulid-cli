import { deepStrictEqual } from 'node:assert/strict';
import path from 'node:path';
import { describe, mock, test } from 'node:test';

import { plain } from '../testing/cli.mjs';

import {
	printOutdated,
	printPlan,
	printProblemList,
	printUpdates,
	printWrittenFiles,
} from './report.mjs';

function printed(print) {
	const log = mock.method(console, 'log', () => {});

	try {
		print();

		return log.mock.calls
			.flatMap((call) => plain(call.arguments.join(' ')).split('\n'))
			.filter((line) => '' !== line);
	} finally {
		log.mock.restore();
	}
}

const update = (key) => ({ scope: 'demo', key, lang: 'es-ES', from: 'Guardar', to: 'Salvar' });

describe('printPlan', () => {
	test('counts each language, aligned', () => {
		const plan = {
			langs: new Set(['es-ES', 'ca']),
			counts: new Map([['es-ES', { updated: 2, unchanged: 1, empty: 0 }]]),
		};

		deepStrictEqual(printed(() => printPlan(plan)), [
			'  es-ES  2 updated · 1 unchanged · 0 empty',
			'  ca     0 updated · 0 unchanged · 0 empty',
		]);
	});

	test('says so when the files held nothing to read', () => {
		deepStrictEqual(printed(() => printPlan({ langs: new Set(), counts: new Map() })), [
			'  ⚠ nothing to read',
		]);
	});
});

describe('printUpdates', () => {
	test('prints nothing when nothing changed', () => {
		deepStrictEqual(printed(() => printUpdates([], 2, true)), []);
	});

	test('only counts the changes without --verbose', () => {
		deepStrictEqual(printed(() => printUpdates([update('SAVE')], 2, false)), [
			'  1 translation changed — re-run with --verbose to list them',
		]);
	});

	test('lists the changes up to the limit, and counts the rest', () => {
		const updates = [update('SAVE'), update('STORE'), update('KEEP')];

		deepStrictEqual(printed(() => printUpdates(updates, 2, true)), [
			'━━ Changes ━━',
			'  demo.SAVE · es-ES',
			'    - Guardar',
			'    + Salvar',
			'  demo.STORE · es-ES',
			'    - Guardar',
			'    + Salvar',
			'  … and 1 more',
		]);
	});
});

describe('printOutdated', () => {
	const outdated = ['SAVE', 'STORE', 'KEEP'].map((key) => ({ scope: 'demo', key, lang: 'es-ES' }));

	test('prints nothing when every unit came back fresh', () => {
		deepStrictEqual(printed(() => printOutdated([], 2, true)), []);
	});

	test('only counts them without --verbose', () => {
		deepStrictEqual(printed(() => printOutdated(outdated, 2, false)), [
			'  ⚠ 3 keys came back without a fresh translation — left outdated',
			'      re-run with --verbose to list them',
		]);
	});

	test('lists them up to the limit, and counts the rest', () => {
		deepStrictEqual(printed(() => printOutdated(outdated, 2, true)), [
			'  ⚠ 3 keys came back without a fresh translation — left outdated',
			'      demo.SAVE · es-ES',
			'      demo.STORE · es-ES',
			'      … and 1 more',
		]);
	});
});

describe('printProblemList', () => {
	test('prints nothing without problems', () => {
		deepStrictEqual(printed(() => printProblemList([])), []);
	});

	test('names the unit of each problem, and counts them', () => {
		const problems = [
			{ file: 'demo.SAVE', message: 'placeholders differ from en-GB' },
			{ file: 'es-ES.xlf', message: 'unknown scope "other"' },
		];

		deepStrictEqual(printed(() => printProblemList(problems)), [
			'━━ Problems ━━',
			'  ✖ demo.SAVE  placeholders differ from en-GB',
			'  ✖ es-ES.xlf  unknown scope "other"',
			'  2 problems',
		]);
	});
});

describe('printWrittenFiles', () => {
	test('says there was nothing to write', () => {
		deepStrictEqual(printed(() => printWrittenFiles([])), ['  ✓ Nothing to write']);
	});

	test('lists each file once, however many times it was written', () => {
		const file = path.resolve('i18n', 'demo', 'es-ES.json');

		deepStrictEqual(printed(() => printWrittenFiles([file, file])), [
			'  Files written:',
			`      ${file}`,
			'  ✔ 1 file updated',
		]);
	});
});
