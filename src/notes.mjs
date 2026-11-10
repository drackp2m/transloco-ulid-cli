#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { isLanguageTag, readDefaults, valueOf } from './catalogue/config.mjs';
import { DEFAULT_NOTES_LANG, quotedList } from './catalogue/note-texts.mjs';
import { planNotes } from './notes/plan.mjs';
import { printNotesUsage } from './notes/usage.mjs';
import { c, plural } from './shared/terminal.mjs';

function parseNotesArgs(argv) {
	const defaults = readDefaults();

	return {
		...defaults,
		...(valueOf(argv, '--dir') ? { i18nDir: valueOf(argv, '--dir') } : {}),
		lang: valueOf(argv, '--lang') ?? defaults.notesLang,
		dryRun: argv.includes('--dry-run'),
	};
}

function fail(message) {
	console.error(`  ${c.red}✖ ${message}${c.reset}`);
	process.exit(1);
}

function summaryOf(plan) {
	if (plan.created) {
		return `${plural(plan.added.length, 'text')} from the English template`;
	}

	return `${plural(plan.added.length, 'text')} added in English: ${quotedList(plan.added)}`;
}

const argv = process.argv.slice(2);

if (argv.includes('--help') || argv.includes('-h')) {
	printNotesUsage();
	process.exit(0);
}

const options = parseNotesArgs(argv);

if (!isLanguageTag(options.lang)) {
	fail(`"${options.lang}" is not a language tag such as "es" or "pt-BR"`);
}

const plan = planNotes(options);

if (undefined !== plan.problem) {
	fail(plan.problem);
}

if (null === plan.content) {
	console.log(`  ${c.dim}✓ ${plan.file} already has every text of the template${c.reset}`);
	process.exit(0);
}

console.log(`  ${c.cyan}${plan.file}${c.reset}  ${summaryOf(plan)}`);

if (options.dryRun) {
	console.log(`\n  ${c.dim}drop --dry-run to write.${c.reset}`);
	process.exit(0);
}

mkdirSync(path.dirname(plan.file), { recursive: true });
writeFileSync(plan.file, plan.content, 'utf8');

const done = plan.created ? 'written' : 'updated';
const hint =
	DEFAULT_NOTES_LANG === options.lang
		? 'Reword what you like, and keep each {placeholder}.'
		: 'Translate each value and keep its {placeholders}: "transloco-ulid check" lists what is left.';

console.log(`\n  ${c.green}✔ ${path.basename(plan.file)} ${done}${c.reset}`);
console.log(`\n  ${c.dim}${hint}${c.reset}`);

if (options.lang !== readDefaults().notesLang) {
	const setting = `Set "notesLang": "${options.lang}" in i18n.config.json to use it.`;

	console.log(`  ${c.dim}${setting}${c.reset}`);
}
