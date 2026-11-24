#!/usr/bin/env node
import path from 'node:path';
import readline from 'node:readline/promises';

import { collectUsages, readScopes } from './catalogue/collect.mjs';
import { listOf, parseArgs } from './catalogue/config.mjs';
import { applyPrune, planPrune, unusedKeys } from './prune/plan.mjs';
import { printPruneUsage } from './prune/usage.mjs';
import { selectFromList } from './shared/select-list.mjs';
import { c, plural } from './shared/terminal.mjs';

const ANSWERS = { y: 'all', yes: 'all', s: 'select', select: 'select' };

function parsePruneArgs(argv) {
	return {
		...parseArgs(argv),
		only: listOf(argv, '--scope') ?? [],
		yes: argv.includes('--yes') || argv.includes('-y'),
		dryRun: argv.includes('--dry-run'),
	};
}

function fail(message) {
	console.error(`  ${c.red}✖ ${message}${c.reset}`);
	process.exit(1);
}

const labelOf = ({ scope, key, source }) => `${scope}.${key} — ${source.replace(/\s+/g, ' ')}`;

function candidatesOf(options) {
	const scopes = readScopes(options);
	const unknown = options.only.filter((name) => !scopes.some((scope) => scope.name === name));

	if (0 === scopes.length) {
		fail(`no scopes in ${options.i18nDir}`);
	}

	if (0 !== unknown.length) {
		fail(`unknown scope(s): ${unknown.join(', ')}`);
	}

	const sources = collectUsages(options.sourceDirs, { pipe: options.pipe });
	const wanted = (item) => 0 === options.only.length || options.only.includes(item.scope);

	return { scopes, unused: unusedKeys({ ...options, scopes, ...sources }).filter(wanted) };
}

async function ask() {
	const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
	const answer = await prompt.question(`\n  Remove them? ${c.dim}[y/N/s]${c.reset} `);

	prompt.close();

	return ANSWERS[answer.trim().toLowerCase()] ?? 'none';
}

async function chosenOf(unused, options) {
	if (options.yes) {
		return unused;
	}

	if (!process.stdin.isTTY) {
		fail('no terminal to ask in — pass --yes to remove them all, or --dry-run to only list them');
	}

	const answer = await ask();

	if ('none' === answer) {
		return [];
	}

	if ('all' === answer) {
		return unused;
	}

	const labels = unused.map(labelOf);
	const chosen = await selectFromList(labels, labels, {
		title: 'Keys nothing uses — untick the ones to keep',
		shortTitle: 'Remove keys',
		noun: 'key',
	});

	return null === chosen ? [] : unused.filter((item) => chosen.includes(labelOf(item)));
}

function printList(unused) {
	for (const item of unused) {
		console.log(`  ${c.yellow}⚠${c.reset} ${labelOf(item)}`);
	}
}

function printFiles(files, title) {
	console.log(`\n  ${c.dim}${title}:${c.reset}`);

	for (const file of files) {
		console.log(`      ${path.resolve(file)}`);
	}
}

function printOutcome(plan, written) {
	printFiles(written, 'Files written');

	for (const scope of plan.paramsLeft) {
		const left = 'params.ts already had pending changes, so it was left untouched';

		console.log(`\n  ${c.yellow}⚠ ${scope}: ${left}${c.reset}`);
	}

	const hint = 'Run "transloco-ulid check" — a context section may still name them.';

	console.log(`\n  ${c.green}✔ ${plural(plan.keys.length, 'key')} removed${c.reset}`);
	console.log(`\n  ${c.dim}${hint}${c.reset}`);
}

async function run(options) {
	const { scopes, unused } = candidatesOf(options);
	const action = options.dryRun ? 'Keys that would be removed' : 'Pruning unused keys';

	const details = plural(unused.length, 'key');

	console.log(`${c.bold}${action}...${c.reset} ${c.dim}(${details})${c.reset}\n`);

	if (0 === unused.length) {
		console.log(`  ${c.dim}✓ Nothing to prune — every key is used${c.reset}`);

		return 0;
	}

	printList(unused);

	const chosen = options.dryRun ? unused : await chosenOf(unused, options);

	if (0 === chosen.length) {
		console.log(`\n  ${c.dim}Nothing removed.${c.reset}`);

		return 0;
	}

	const plan = planPrune({ ...options, scopes, keys: chosen });

	if (0 !== plan.problems.length) {
		fail(plan.problems.join('\n    '));
	}

	if (options.dryRun) {
		const files = [...plan.writes, ...plan.seals].map(({ file }) => file);

		printFiles(files, 'Files that would be written');
		console.log(`\n  ${c.dim}drop --dry-run to write.${c.reset}`);

		return 0;
	}

	printOutcome(plan, applyPrune({ plan }));

	return 0;
}

const argv = process.argv.slice(2);

if (argv.includes('--help') || argv.includes('-h')) {
	printPruneUsage();
	process.exit(0);
}

process.exit(await run(parsePruneArgs(argv)));
