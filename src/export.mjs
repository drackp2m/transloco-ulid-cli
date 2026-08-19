#!/usr/bin/env node
import { c } from '../lint/lint-report.mjs';

import { collectUsages, readScopes } from './collect.mjs';
import { DEFAULTS, listOf, readLanguages, valueOf } from './config.mjs';
import { readContext } from './context.mjs';
import { printExportHeader, printExported, printHint } from './transfer-report.mjs';
import { DEFAULT_OUT_DIR, buildExport, exportLangs, writeExport } from './transfer.mjs';

function filterOf(argv) {
	if (argv.includes('--pending')) {
		return 'pending';
	}

	if (argv.includes('--stale')) {
		return 'stale';
	}

	return argv.includes('--missing') ? 'missing' : 'all';
}

function parseExportArgs(argv) {
	const languageFile = valueOf(argv, '--languages');

	return {
		...DEFAULTS,
		...(valueOf(argv, '--dir') ? { i18nDir: valueOf(argv, '--dir') } : {}),
		...(languageFile ? { languageFile, ...readLanguages(languageFile) } : {}),
		out: valueOf(argv, '--out') ?? DEFAULT_OUT_DIR,
		requested: listOf(argv, '--lang') ?? [],
		only: listOf(argv, '--scope') ?? [],
		filter: filterOf(argv),
	};
}

const options = parseExportArgs(process.argv.slice(2));
const scopes = readScopes(options);

if (0 === scopes.length) {
	console.error(`  ${c.red}✖ no scopes in ${options.i18nDir}${c.reset}`);
	process.exit(1);
}

let targets;

try {
	targets = exportLangs(options, options.requested);
} catch (error) {
	console.error(`  ${c.red}✖ ${error.message}${c.reset}`);
	process.exit(1);
}

if (0 === targets.length) {
	console.error(`  ${c.red}✖ nothing to export — every language is the source one${c.reset}`);
	process.exit(1);
}

printExportHeader(targets, options.defaultLang);

const { usages } = collectUsages(options.sourceDirs);
const context = readContext(options);
const built = targets.map((lang) => buildExport({ ...options, scopes, lang, usages, context }));
const empty = built.filter((document) => 0 === document.total);
const documents = built
	.filter((document) => 0 !== document.total)
	.map((document) => writeExport(document, options.out));

if (0 !== empty.length) {
	printHint(`Nothing to send for ${empty.map(({ lang }) => lang).join(', ')} — no unit matched.`);
}

if (0 === documents.length) {
	process.exit(0);
}

printExported(documents);
printHint(`Send these to the translator; bring them back with "pnpm i18n:import".`);
