import { deepStrictEqual, ok, strictEqual, throws } from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
	FIXABLE_TYPES,
	GROUPS,
	RULES,
	RULE_TYPES,
	SEVERITIES,
	groupOf,
	isFixable,
	isRule,
	ruleOf,
	severityOf,
	typesOf,
	withRule,
} from './findings.mjs';

const SRC = fileURLToPath(new URL('..', import.meta.url));
const README = fileURLToPath(new URL('../../README.md', import.meta.url));

const SEVERITY_WORDS = { error: 'error', warning: 'warning', info: 'note' };

function sourceFiles(dir) {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const full = path.join(dir, entry.name);

		if (entry.isDirectory()) {
			return 'testing' === entry.name ? [] : sourceFiles(full);
		}

		return entry.name.endsWith('.mjs') && !entry.name.endsWith('.test.mjs') ? [full] : [];
	});
}

const EMITTED = [
	/\b(?:finding|problem)\(\s*'([a-z]+(?:-[a-z]+)+)'/g,
	/\btype: '([a-z]+(?:-[a-z]+)+)'/g,
	/\bconst [A-Z_]+ = '([a-z]+(?:-[a-z]+)+)';/g,
];

function emittedTypes() {
	const found = new Set();

	for (const file of sourceFiles(SRC).filter((name) => !name.endsWith('findings.mjs'))) {
		const text = readFileSync(file, 'utf8');

		for (const pattern of EMITTED) {
			for (const [, type] of text.matchAll(pattern)) {
				found.add(type);
			}
		}
	}

	return found;
}

function readmeRows(heading) {
	const lines = readFileSync(README, 'utf8').split('\n');
	const start = lines.findIndex((line) => line.startsWith(`| ${heading} `));
	const end = lines.findIndex((line, index) => index > start && !line.startsWith('|'));

	return lines.slice(start + 2, end).map((line) =>
		line
			.split('|')
			.slice(1, -1)
			.map((cell) => cell.trim()),
	);
}

const rowOf = (type) => {
	const { group, severity, fixable, meaning } = RULES[type];

	return [`\`${type}\``, group, SEVERITY_WORDS[severity], fixable ? '✔' : '', meaning];
};

describe('the rule registry', () => {
	test('gives every rule a group, a severity and a meaning it knows', () => {
		for (const type of RULE_TYPES) {
			const { group, severity, fixable, meaning } = RULES[type];

			ok(GROUPS.includes(group), `${type}: group "${group}"`);
			ok(SEVERITIES.includes(severity), `${type}: severity "${severity}"`);
			strictEqual(typeof fixable, 'boolean', type);
			ok(meaning.endsWith('.'), `${type}: meaning`);
		}
	});

	test('leaves no group empty', () => {
		deepStrictEqual(
			GROUPS.filter((group) => 0 === typesOf(group).length),
			[],
		);
	});

	test('answers for one rule', () => {
		strictEqual(severityOf('missing-translation'), 'error');
		strictEqual(groupOf('missing-translation'), 'pending');
		strictEqual(isFixable('missing-translation'), true);
		strictEqual(severityOf('commented-usage'), 'info');
		strictEqual(isFixable('empty-translation'), false);
	});

	test('lists what --fix settles', () => {
		deepStrictEqual(
			[...FIXABLE_TYPES],
			[
				'missing-translation',
				'orphan-translation',
				'stale-params',
				'missing-params-file',
				'unregistered-scope',
			],
		);
	});

	test('lists the rules of a group in the order of the table', () => {
		deepStrictEqual(typesOf('pending'), [
			'missing-translation',
			'empty-translation',
			'stale-translation',
		]);
	});

	test('refuses a rule nobody registered', () => {
		strictEqual(isRule('made-up'), false);
		throws(() => ruleOf('made-up'), /"made-up" is not a registered rule/);
		throws(() => severityOf('made-up'), /not a registered rule/);
	});

	test('adds what the registry knows to a finding', () => {
		deepStrictEqual(withRule({ type: 'unused-key', message: 'X is never referenced' }), {
			type: 'unused-key',
			message: 'X is never referenced',
			group: 'usage',
			severity: 'warning',
			fixable: false,
			meaning: 'Nothing references the key.',
		});
	});
});

describe('the rule registry against the code', () => {
	test('knows every finding the sources can emit', () => {
		deepStrictEqual(
			[...emittedTypes()].filter((type) => !isRule(type)),
			[],
		);
	});

	test('holds no rule nothing emits', () => {
		const emitted = emittedTypes();

		deepStrictEqual(
			RULE_TYPES.filter((type) => !emitted.has(type)),
			[],
		);
	});
});

describe('the rule registry against the README', () => {
	const IMPORT = 'import';

	test('is the table of what check reports, row by row', () => {
		const reported = RULE_TYPES.filter((type) => IMPORT !== groupOf(type));

		deepStrictEqual(readmeRows('Finding'), reported.map(rowOf));
	});

	test('is the table of what import reports, row by row', () => {
		deepStrictEqual(
			readmeRows('Problem'),
			typesOf(IMPORT).map((type) => [`\`${type}\``, RULES[type].meaning]),
		);
	});
});
