const { readFileSync } = require('node:fs');
const path = require('node:path');

const vscode = require('vscode');

const { reveal } = require('./output');
const { unusedKeys } = require('./prune');
const settings = require('./settings');
const { count } = require('./util');

const XLIFF_FILTERS = { XLIFF: ['xlf', 'xliff'] };

function transferDir(root) {
	const configured = settings.transferDir();

	return path.isAbsolute(configured) ? configured : path.join(root, configured);
}

function showProblems(problems) {
	reveal(problems.map(({ file, message, type }) => `${file}  ${message}  ${type}`));
}

async function pickLangs(index) {
	const targets = index.langs.filter((lang) => lang !== index.defaultLang);
	const picked = await vscode.window.showQuickPick(
		targets.map((lang) => ({ label: lang, picked: true })),
		{ title: `Languages to export (source: ${index.defaultLang})`, canPickMany: true },
	);

	return picked?.map(({ label }) => label) ?? null;
}

const FILTERS = [
	{ label: 'Every string', filter: 'all', description: 'the whole catalogue' },
	{ label: 'Pending', filter: 'pending', description: 'untranslated and outdated' },
	{ label: 'Only untranslated', filter: 'missing', description: 'what has no target yet' },
	{ label: 'Only outdated', filter: 'stale', description: 'what the source changed under' },
];

async function pickFilter(index) {
	const unused = unusedKeys(index).length;
	const aside = 0 === unused ? '' : ` (${count(unused, 'unused key')} left out)`;
	const picked = await vscode.window.showQuickPick(FILTERS, { title: `What to export${aside}` });

	return picked?.filter ?? null;
}

async function revealed(written, outDir) {
	const message = `i18n: ${count(written.length, 'file')} written to ${outDir}`;
	const action = await vscode.window.showInformationMessage(message, 'Reveal');

	if ('Reveal' === action) {
		await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(written[0]));
	}
}

const NAMES_SHOWN = 5;
const INCLUDE_UNUSED = 'Export them too';
const LEAVE_UNUSED = 'Leave them out';

function buildExports(index, langs, { filter, only, unused }) {
	const { api, project, analysis } = index;
	const base = {
		...project,
		scopes: analysis.scopes,
		usages: analysis.sources.usages,
		commented: analysis.sources.commented,
		filter,
		unused,
		...(null === only ? {} : { only: [only] }),
	};

	return langs.map((lang) => api.buildExport({ ...base, lang }));
}

function unusedOf(documents) {
	const names = documents.flatMap(({ unused = [] }) =>
		unused.map(({ scope, key }) => `${scope}.${key}`),
	);

	return [...new Set(names)];
}

async function askUnused(names) {
	const shown = names.slice(0, NAMES_SHOWN).join(', ');
	const more = names.length > NAMES_SHOWN ? ` and ${names.length - NAMES_SHOWN} more` : '';
	const message = `i18n: ${count(names.length, 'key')} nobody uses left out: ${shown}${more}`;

	return vscode.window.showWarningMessage(message, INCLUDE_UNUSED, LEAVE_UNUSED);
}

async function exportTranslations(index) {
	const langs = await pickLangs(index);

	if (null === langs || 0 === langs.length) {
		return;
	}

	const filter = await pickFilter(index);

	if (null === filter) {
		return;
	}

	await exportWith(index, langs, { filter, only: null });
}

async function exportWith(index, langs, { filter, only, unused = false }) {
	const documents = buildExports(index, langs, { filter, only, unused });
	const names = unusedOf(documents);
	const choice = unused || 0 === names.length ? LEAVE_UNUSED : await askUnused(names);

	if (INCLUDE_UNUSED === choice) {
		await exportWith(index, langs, { filter, only, unused: true });

		return;
	}

	if (undefined !== choice) {
		await writeAll(index, documents);
	}
}

async function writeAll(index, documents) {
	const outDir = transferDir(index.root);
	const written = documents
		.filter((document) => 0 !== document.total)
		.map((document) => index.api.writeExport(document, outDir).file);

	if (0 === written.length) {
		vscode.window.showInformationMessage('i18n: nothing to export');

		return;
	}

	await revealed(written, outDir);
}

async function exportPending(index, node) {
	const lang = node?.language?.lang;

	if (undefined === lang) {
		return;
	}

	await exportWith(index, [lang], { filter: 'pending', only: node.scope ?? null });
}

// Import writes the JSON and keys.ts files straight to disk, so an unsaved
// editor over any of them would be overwritten the moment it is saved back.
function dirtyIn(dir) {
	return vscode.workspace.textDocuments
		.filter((document) => document.isDirty && document.uri.fsPath.startsWith(dir))
		.map((document) => path.basename(document.uri.fsPath));
}

async function pickNewKeys(added) {
	if (0 === added.length) {
		return [];
	}

	const picked = await vscode.window.showQuickPick(
		added.map((entry) => ({
			label: `${entry.scope}.${entry.name}`,
			description: entry.source,
			entry,
		})),
		{
			title: 'Keys the file has that keys.ts does not — pick the ones to add',
			canPickMany: true,
		},
	);

	return picked?.map(({ entry }) => entry) ?? null;
}

function readDocuments(index, uris) {
	return uris.map((uri) => ({
		file: uri.fsPath,
		xliff: index.api.readXliff(readFileSync(uri.fsPath, 'utf8')),
	}));
}

function report(plan, written, accepted) {
	const updated = [...plan.counts.values()].reduce((total, item) => total + item.updated, 0);
	const parts = [count(updated, 'string'), `${count(written.length, 'file')} written`];

	if (0 !== accepted.length) {
		parts.push(count(accepted.length, 'new key'));
	}

	vscode.window.showInformationMessage(`i18n: ${parts.join(' · ')}`);

	if (0 !== plan.problems.length) {
		showProblems(plan.problems);
	}
}

async function chooseFiles(index) {
	const uris = await vscode.window.showOpenDialog({
		title: 'XLIFF files to import',
		canSelectMany: true,
		defaultUri: vscode.Uri.file(transferDir(index.root)),
		filters: XLIFF_FILTERS,
	});

	return undefined === uris || 0 === uris.length ? null : uris;
}

async function importTranslations(index, annotations) {
	const dirty = dirtyIn(index.i18nDir);

	if (0 !== dirty.length) {
		throw new Error(`save ${dirty.join(', ')} first — the import writes those files`);
	}

	const uris = await chooseFiles(index);

	if (null === uris) {
		return;
	}

	const base = { ...index.project, scopes: index.rawScopes };
	const plan = index.api.planImport({ ...base, documents: readDocuments(index, uris) });
	const accepted = await pickNewKeys(plan.added);

	if (null === accepted) {
		return;
	}

	const written = index.api.applyImport({ ...base, plan, accepted });

	await index.reload();
	annotations.refreshAll();
	report(plan, written, accepted);
}

module.exports = { exportPending, exportTranslations, importTranslations };
