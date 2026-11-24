const path = require('node:path');

const vscode = require('vscode');

const { reveal } = require('./output');
const { count } = require('./util');

const SEALABLE = ['stale', 'unknown'];
const NEEDED = 'sealing needs @drackp2m/transloco-ulid-cli 0.5.0 or later';

const isSealable = (row) => SEALABLE.includes(row.status);

const sealableIn = (languages) =>
	languages.flatMap((language) => SEALABLE.flatMap((status) => language.keys[status]));

const ROWS = {
	key: ({ row }) => [row],
	status: ({ status, language }) => language.keys[status],
	scope: ({ scope }) => sealableIn(scope.languages),
};

const rowsOf = (node) => (ROWS[node?.kind]?.(node) ?? []).filter(isSealable);

function dirtyIn(dir) {
	return vscode.workspace.textDocuments
		.filter((document) => document.isDirty && document.uri.fsPath.startsWith(`${dir}${path.sep}`))
		.map((document) => path.basename(document.uri.fsPath));
}

async function confirmed(rows) {
	if (1 === rows.length) {
		return true;
	}

	const langs = [...new Set(rows.map(({ lang }) => lang))].join(', ');
	const detail = `They will read as up to date with today's source text, reviewed or not (${langs}).`;
	const answer = await vscode.window.showWarningMessage(
		`Seal ${count(rows.length, 'translation')}?`,
		{ modal: true, detail },
		'Seal',
	);

	return 'Seal' === answer;
}

function report({ seals, refused }) {
	const lines = refused.map(
		({ scope, name, lang, reasons }) => `${scope}.${name} [${lang}]: ${reasons.join('; ')}`,
	);

	if (0 === lines.length) {
		vscode.window.showInformationMessage(`i18n: ${count(seals.length, 'translation')} sealed`);

		return;
	}

	reveal([`${count(lines.length, 'translation')} not sealed:`, ...lines]);
	vscode.window.showWarningMessage(
		`i18n: ${seals.length} sealed, ${lines.length} not sealed — see the output channel`,
	);
}

async function seal(index, node) {
	const rows = rowsOf(node);
	const dirty = dirtyIn(index.i18nDir);

	if ('function' !== typeof index.api?.planSeal) {
		throw new Error(NEEDED);
	}

	if (0 !== dirty.length) {
		throw new Error(`save ${dirty.join(', ')} first — a seal is taken from the files on disk`);
	}

	if (0 === rows.length || !(await confirmed(rows))) {
		return;
	}

	const project = { ...index.project, scopes: index.rawScopes };
	const targets = rows.map(({ scope, ulid, lang }) => ({ scope, key: ulid, lang }));
	const plan = index.api.planSeal(project, targets);

	index.api.applySeal(project, plan);
	report(plan);
}

module.exports = { isSealable, rowsOf, seal };
