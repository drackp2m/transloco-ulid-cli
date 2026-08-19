#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { c, plural } from '../lint/lint-report.mjs';
import { selectFromList } from '../util/select-list.mjs';

import { readScopes } from './collect.mjs';
import { DEFAULTS, listOf, readLanguages, valueOf } from './config.mjs';
import { applyImport, planImport } from './merge.mjs';
import {
	printHint,
	printImportHeader,
	printOutdated,
	printPlan,
	printProblemList,
	printUpdates,
	printWrittenFiles,
} from './transfer-report.mjs';
import { DEFAULT_OUT_DIR } from './transfer.mjs';
import { readXliff } from './xliff.mjs';

const EXTENSIONS = new Set(['.xlf', '.xliff']);
const CHANGE_LIMIT = 20;

function newKeyMode(argv) {
	if (argv.includes('--all-new')) {
		return 'all';
	}

	return argv.includes('--no-new') ? 'none' : 'ask';
}

function parseImportArgs(argv) {
	const languageFile = valueOf(argv, '--languages');
	const flagged = new Set(['--dir', '--languages', '--langs']);
	const positional = argv.filter(
		(arg, index) => !arg.startsWith('--') && !flagged.has(argv[index - 1]),
	);

	return {
		...DEFAULTS,
		...(valueOf(argv, '--dir') ? { i18nDir: valueOf(argv, '--dir') } : {}),
		...(languageFile ? { languageFile, ...readLanguages(languageFile) } : {}),
		...(listOf(argv, '--langs')?.length ? { langs: listOf(argv, '--langs') } : {}),
		inputs: 0 === positional.length ? [DEFAULT_OUT_DIR] : positional,
		newKeys: newKeyMode(argv),
		dryRun: argv.includes('--dry-run'),
	};
}

function resolveInputs(inputs) {
	return inputs.flatMap((input) => {
		if (!existsSync(input)) {
			throw new Error(`${input} does not exist`);
		}

		if (!statSync(input).isDirectory()) {
			return [input];
		}

		return readdirSync(input)
			.filter((name) => EXTENSIONS.has(path.extname(name)))
			.sort()
			.map((name) => path.join(input, name));
	});
}

const label = ({ scope, name, source }) => `${scope} · ${name} — ${source.replace(/\s+/g, ' ')}`;

async function chooseNewKeys(added, mode) {
	if ('none' === mode || 0 === added.length) {
		return [];
	}

	if ('all' === mode) {
		return added;
	}

	if (!process.stdin.isTTY) {
		printHint(`${plural(added.length, 'new key')} skipped — pass --all-new to add them.`);

		return [];
	}

	const labels = added.map((entry) => label(entry));
	const chosen = await selectFromList(labels, [], {
		title: 'Keys the file has that keys.ts does not — pick the ones to add',
		shortTitle: 'Add new keys',
		noun: 'key',
	});

	return null === chosen ? [] : added.filter((entry) => chosen.includes(label(entry)));
}

function readDocuments(files) {
	return files.map((file) => ({ file, xliff: readXliff(readFileSync(file, 'utf8')) }));
}

async function run(options) {
	const files = resolveInputs(options.inputs);

	if (0 === files.length) {
		console.error(`  ${c.red}✖ no .xlf files in ${options.inputs.join(', ')}${c.reset}`);

		return 1;
	}

	printImportHeader(files);

	const scopes = readScopes(options);
	const plan = planImport({ ...options, scopes, documents: readDocuments(files) });

	printPlan(plan);
	printUpdates(plan.updates, CHANGE_LIMIT);

	const accepted = await chooseNewKeys(plan.added, options.newKeys);

	if (options.dryRun) {
		printHint('--dry-run: nothing was written.');
		printOutdated(plan.outdated, CHANGE_LIMIT);
		printProblemList(plan.problems);

		return 0;
	}

	printWrittenFiles(applyImport({ ...options, plan, scopes, accepted }));

	if (0 !== accepted.length) {
		printHint('New keys landed in keys.ts — run "pnpm i18n:check --fix" to refresh params.ts.');
	}

	printOutdated(plan.outdated, CHANGE_LIMIT);

	printProblemList(plan.problems);

	return 0;
}

let exitCode;

try {
	exitCode = await run(parseImportArgs(process.argv.slice(2)));
} catch (error) {
	console.error(`  ${c.red}✖ ${error.message}${c.reset}`);
	exitCode = 1;
}

process.exit(exitCode);
