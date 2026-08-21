import path from 'node:path';

import { c, plural } from '../../lint/lint-report.mjs';

const fullPath = (file) => path.resolve(file);

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

export function printUpdates(updates, limit) {
	if (0 === updates.length) {
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

export function printOutdated(outdated, limit) {
	if (0 === outdated.length) {
		return;
	}

	const message = `${plural(outdated.length, 'unit')} came back translated from an older source`;

	console.log(`\n  ${c.yellow}⚠ ${message} — left outdated${c.reset}`);

	for (const { scope, key, lang } of outdated.slice(0, limit)) {
		console.log(`      ${c.dim}${scope}.${key} · ${lang}${c.reset}`);
	}

	if (outdated.length > limit) {
		console.log(`      ${c.dim}… and ${outdated.length - limit} more${c.reset}`);
	}
}

export const printHint = (message) => console.log(`\n  ${c.dim}${message}${c.reset}`);
