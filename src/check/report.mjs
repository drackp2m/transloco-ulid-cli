import path from 'node:path';

import { c, plural, printProblems, printTally } from '../../lint/lint-report.mjs';

import { FIXABLE_TYPES, cellsOf, columnsOf, severityOf } from './findings.mjs';

const NAME_COLUMN = 'scope';
const ICONS = {
	ok: ` ${c.green}✔${c.reset}`,
	warning: ` ${c.yellow}⚠${c.reset}`,
	error: ` ${c.red}✖${c.reset}`,
};

const fullPath = (file) => path.resolve(file);

const padIcon = (icon, column) => `${icon}${' '.repeat(Math.max(0, column.length - 2))}`;

function tableRow(scope, findings, columns) {
	return {
		name: scope.name,
		cells: cellsOf(scope, findings, columns).map((status) => ICONS[status]),
	};
}

function printTable(scopes, findings, langs) {
	const columns = columnsOf(langs);
	const rows = scopes.map((scope) => tableRow(scope, findings, columns));
	const nameWidth = Math.max(...rows.map((row) => row.name.length), NAME_COLUMN.length);

	console.log(`\n  ${c.dim}${NAME_COLUMN.padEnd(nameWidth)}  ${columns.join('  ')}${c.reset}`);

	for (const { name, cells } of rows) {
		const painted = cells.map((cell, index) => padIcon(cell, columns[index]));

		console.log(`  ${c.cyan}${name.padEnd(nameWidth)}${c.reset}  ${painted.join('  ')}`);
	}
}

function toProblems(findings) {
	const order = [...new Set(findings.map(({ file }) => file))];

	return findings
		.map((item) => ({
			file: fullPath(item.file),
			...(null === item.line ? {} : { line: item.line, col: item.col ?? 1 }),
			severity: severityOf(item.type),
			message: item.message,
			rule: item.type,
			order: order.indexOf(item.file),
		}))
		.sort((left, right) => left.order - right.order || (left.line ?? 0) - (right.line ?? 0));
}

function printFixable(findings) {
	const fixable = findings.filter(({ type }) => FIXABLE_TYPES.has(type)).length;

	if (0 !== fixable) {
		const message = `${plural(fixable, 'problem')} potentially fixable with the --fix option.`;

		console.log(`  ${c.dim}${message}${c.reset}`);
	}
}

// Warnings and notes never reach the exit code, so they stay counted but unlisted:
// only errors are printed unless --verbose asks for the whole picture.
function printHidden(warnings, notes) {
	const parts = [
		0 !== warnings ? plural(warnings, 'warning') : null,
		0 !== notes ? plural(notes, 'note') : null,
	].filter((part) => null !== part);

	if (0 === parts.length) {
		return;
	}

	const hint = `${parts.join(' · ')} hidden — re-run with --verbose to list them`;

	console.log(`\n  ${c.dim}${hint}${c.reset}`);
}

function printListed(listed) {
	const errors = listed.filter(({ severity }) => 'error' === severity);
	const rest = listed.filter(({ severity }) => 'error' !== severity);

	if (0 !== rest.length) {
		printProblems(rest);
	}

	if (0 !== errors.length) {
		printProblems(errors);
	}
}

function printInfos(infos) {
	console.log(`\n${c.bold}${c.cyan}━━ Info ━━${c.reset}`);
	printProblems(infos);
	console.log(`\n  ${c.blue}ℹ${c.reset} ${plural(infos.length, 'note')}`);
}

export function printFindings(findings, { scopes, langs, fix, verbose }) {
	printTable(scopes, findings, langs);

	const infos = toProblems(findings.filter((item) => 'info' === severityOf(item.type)));
	const problems = toProblems(findings.filter((item) => 'info' !== severityOf(item.type)));
	const listed = verbose ? problems : problems.filter(({ severity }) => 'error' === severity);

	if (verbose && 0 !== infos.length) {
		printInfos(infos);
	}

	if (0 === problems.length) {
		console.log(`\n  ${c.green}✔ Every key is declared, translated and used.${c.reset}`);
	} else {
		console.log(`\n${c.bold}${c.cyan}━━ Problems ━━${c.reset}`);

		printListed(listed);
		printTally(problems);

		if (!fix) {
			printFixable(findings);
		}
	}

	printHidden(problems.length - listed.length, verbose ? 0 : infos.length);

	return problems.some(({ severity }) => 'error' === severity) ? 1 : 0;
}

export function printWritten(written) {
	if (0 === written.length) {
		console.log(`\n  ${c.dim}✓ Nothing to write${c.reset}`);

		return;
	}

	console.log(`\n  ${c.dim}Files written:${c.reset}`);

	for (const file of written) {
		console.log(`      ${fullPath(file)}`);
	}

	console.log(`\n  ${c.green}✔ ${plural(written.length, 'file')} updated${c.reset}`);
}
