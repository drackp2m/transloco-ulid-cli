import path from 'node:path';

import { c, plural } from '../../lint/lint-report.mjs';

const fullPath = (file) => path.resolve(file);

export const printHint = (message) => console.log(`\n  ${c.dim}${message}${c.reset}`);

export function printExportHeader(langs, defaultLang) {
	const details = `${plural(langs.length, 'language')} · source ${defaultLang}`;

	console.log(`${c.bold}Exporting i18n...${c.reset} ${c.dim}(${details})${c.reset}\n`);
}

function stateOf({ untranslated, outdated }) {
	const parts = [
		...(0 === untranslated ? [] : [`${c.yellow}${untranslated} untranslated${c.reset}`]),
		...(0 === outdated ? [] : [`${c.yellow}${outdated} outdated${c.reset}`]),
	];

	return 0 === parts.length ? `${c.green}complete${c.reset}` : parts.join(` ${c.dim}·${c.reset} `);
}

export function printExported(documents) {
	const width = Math.max(...documents.map(({ file }) => file.length));

	for (const document of documents) {
		const { file, total } = document;
		const left = `${c.cyan}${file.padEnd(width)}${c.reset}`;

		console.log(`  ${left}  ${plural(total, 'unit')} · ${stateOf(document)}`);
	}

	console.log(`\n  ${c.green}✔ ${plural(documents.length, 'file')} written${c.reset}`);
}

export function printImportHeader(files) {
	const count = plural(files.length, 'file');

	console.log(`${c.bold}Importing i18n...${c.reset} ${c.dim}(${count})${c.reset}`);

	for (const file of files) {
		console.log(`  ${c.dim}${fullPath(file)}${c.reset}`);
	}

	console.log('');
}

function countsOf(plan, lang) {
	const { updated, unchanged, empty } = plan.counts.get(lang) ?? {};

	return `${updated ?? 0} updated · ${unchanged ?? 0} unchanged · ${empty ?? 0} empty`;
}

export function printPlan(plan) {
	const langs = [...plan.langs];

	if (0 === langs.length) {
		console.log(`  ${c.yellow}⚠ nothing to read${c.reset}`);

		return;
	}

	const width = Math.max(...langs.map((lang) => lang.length));

	for (const lang of langs) {
		console.log(`  ${c.cyan}${lang.padEnd(width)}${c.reset}  ${countsOf(plan, lang)}`);
	}
}

// Changed and outdated units are notes, never a failure: they stay counted but unlisted
// unless --verbose asks for them one by one.
export function printUpdates(updates, limit, verbose) {
	if (0 === updates.length) {
		return;
	}

	if (!verbose) {
		printHint(
			`${plural(updates.length, 'translation')} changed — re-run with --verbose to list them`,
		);

		return;
	}

	console.log(`\n${c.bold}${c.cyan}━━ Changes ━━${c.reset}`);

	for (const { scope, key, lang, from, to } of updates.slice(0, limit)) {
		console.log(`  ${c.dim}${scope}.${key} · ${lang}${c.reset}`);
		console.log(`    ${c.red}- ${from}${c.reset}`);
		console.log(`    ${c.green}+ ${to}${c.reset}`);
	}

	if (updates.length > limit) {
		console.log(`  ${c.dim}… and ${updates.length - limit} more${c.reset}`);
	}
}

export function printProblemList(problems) {
	if (0 === problems.length) {
		return;
	}

	console.log(`\n${c.bold}${c.cyan}━━ Problems ━━${c.reset}`);

	for (const { file, message } of problems) {
		console.log(`  ${c.red}✖${c.reset} ${c.dim}${file}${c.reset}  ${message}`);
	}

	console.log(`\n  ${c.red}${plural(problems.length, 'problem')}${c.reset}`);
}

export function printWrittenFiles(written) {
	if (0 === written.length) {
		console.log(`\n  ${c.dim}✓ Nothing to write${c.reset}`);

		return;
	}

	console.log(`\n  ${c.dim}Files written:${c.reset}`);

	for (const file of [...new Set(written)]) {
		console.log(`      ${fullPath(file)}`);
	}

	console.log(`\n  ${c.green}✔ ${plural(new Set(written).size, 'file')} updated${c.reset}`);
}

export function printOutdated(outdated, limit, verbose) {
	if (0 === outdated.length) {
		return;
	}

	const message = `${plural(outdated.length, 'key')} came back without a fresh translation`;

	console.log(`\n  ${c.yellow}⚠ ${message} — left outdated${c.reset}`);

	if (!verbose) {
		console.log(`      ${c.dim}re-run with --verbose to list them${c.reset}`);

		return;
	}

	for (const { scope, key, lang } of outdated.slice(0, limit)) {
		console.log(`      ${c.dim}${scope}.${key} · ${lang}${c.reset}`);
	}

	if (outdated.length > limit) {
		console.log(`      ${c.dim}… and ${outdated.length - limit} more${c.reset}`);
	}
}
