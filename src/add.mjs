#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { planKey } from './add/plan.mjs';
import { pluralProblems, pluralSource } from './add/rules.mjs';
import { printAddUsage } from './add/usage.mjs';
import { readScopes } from './catalogue/collect.mjs';
import { readDefaults, readLanguages, toPascalCase, valueOf } from './catalogue/config.mjs';
import { CATEGORY_ORDER } from './catalogue/message.mjs';
import { c, plural } from './shared/terminal.mjs';

function formsOf(argv) {
	return new Map(
		CATEGORY_ORDER.filter((category) => argv.includes(`--${category}`)).map((category) => [
			category,
			valueOf(argv, `--${category}`) ?? '',
		]),
	);
}

function parseAddArgs(argv) {
	const defaults = readDefaults();
	const languageFile = valueOf(argv, '--languages');

	return {
		...defaults,
		...(valueOf(argv, '--dir') ? { i18nDir: valueOf(argv, '--dir') } : {}),
		...(languageFile ? { languageFile, ...readLanguages(languageFile) } : {}),
		scopeName: valueOf(argv, '--scope') ?? defaults.rootScope,
		name: valueOf(argv, '--name'),
		text: valueOf(argv, '--text'),
		argument: valueOf(argv, '--plural'),
		forms: formsOf(argv),
		dryRun: argv.includes('--dry-run'),
	};
}

function fail(problems) {
	for (const problem of problems) {
		console.error(`  ${c.red}✖ ${problem}${c.reset}`);
	}

	process.exit(1);
}

function shapeProblems({ name, text, argument, forms }) {
	if (null === name) {
		return ['name the key with --name <NAME>'];
	}

	if (null !== text && null !== argument) {
		return ['give --text or --plural, not both'];
	}

	if (null === argument && 0 !== forms.size) {
		const flags = [...forms.keys()].map((key) => `--${key}`).join(', ');

		return [`${flags} ${1 === forms.size ? 'goes' : 'go'} only with --plural <param>`];
	}

	return null === text && null === argument
		? ['give the source text with --text, or --plural <param> and its forms']
		: [];
}

function sourceOf(options) {
	if (null === options.argument) {
		return options.text;
	}

	const problems = pluralProblems(options.argument, options.forms, options.defaultLang);

	return 0 === problems.length ? pluralSource(options.argument, options.forms) : fail(problems);
}

function scopeOf(options) {
	const owned = readScopes(options).filter((scope) => scope.keys);
	const scope = owned.find((entry) => entry.name === options.scopeName);
	const names = owned.map((entry) => entry.name).join(', ');

	return scope ?? fail([`unknown scope "${options.scopeName}" — the scopes are ${names}`]);
}

function referenceOf(scope, name) {
	const pascal = toPascalCase(scope.name);

	return `I18n.${pascal.charAt(0).toLowerCase()}${pascal.slice(1)}.${name}`;
}

function printPlan(plan, { scope, name, text, defaultLang, dryRun }) {
	console.log(`  ${c.cyan}${scope.name}.${name}${c.reset}  ${c.dim}${plan.ulid}${c.reset}`);
	console.log(`  ${c.dim}${defaultLang}${c.reset}  ${text}`);

	if (0 !== plan.warnings.length) {
		console.log('');
	}

	for (const warning of plan.warnings) {
		console.log(`  ${c.yellow}⚠ ${warning}${c.reset}`);
	}

	console.log(`\n  ${c.dim}${dryRun ? 'Files that would be written' : 'Files written'}:${c.reset}`);

	for (const write of plan.writes) {
		console.log(`      ${path.resolve(write.file)}`);
	}
}

const argv = process.argv.slice(2);

if (argv.includes('--help') || argv.includes('-h')) {
	printAddUsage();
	process.exit(0);
}

const options = parseAddArgs(argv);
const shape = shapeProblems(options);

if (0 !== shape.length) {
	fail(shape);
}

const text = sourceOf(options);
const scope = scopeOf(options);
const plan = planKey({ ...options, scope, text });
const details = `${scope.name} · ${plural(options.langs.length, 'language')}`;
const action = options.dryRun ? 'Key that would be added' : 'Adding a key';

if (0 !== plan.problems.length) {
	fail(plan.problems);
}

console.log(`${c.bold}${action}...${c.reset} ${c.dim}(${details})${c.reset}\n`);
printPlan(plan, { ...options, scope, text });

if (options.dryRun) {
	console.log(`\n  ${c.dim}drop --dry-run to write.${c.reset}`);
	process.exit(0);
}

for (const write of plan.writes) {
	writeFileSync(write.file, write.content, 'utf8');
}

console.log(`\n  ${c.green}✔ ${referenceOf(scope, options.name)} added${c.reset}`);
