const path = require('node:path');

const vscode = require('vscode');

const { Annotations } = require('./annotations');
const { createKey } = require('./create-key');
const { Findings } = require('./findings');
const { i18nDefinitionProvider, i18nReferenceProvider } = require('./navigation');
const { fail, report, show } = require('./output');
const { completionProvider, definitionProvider, hoverProvider } = require('./providers');
const { pruneUnused } = require('./prune');
const { searchKeys } = require('./search');
const { ensureTemplateSetup } = require('./setup');
const actions = require('./status-actions');
const { askFilter } = require('./status-filter');
const { seal } = require('./status-seal');
const { STATUS_VIEW, StatusView, openKey } = require('./status-view');
const { exportPending, exportTranslations, importTranslations } = require('./transfer');
const { UsageIndex } = require('./usages');

const { I18nIndex } = require('./index');

const DEBOUNCE = 250;

async function reload(state, notify) {
	const error = await state.index.reload();

	if (null !== error) {
		(true === notify ? fail : report)([error]);
	}

	state.findings.show();

	return error;
}

function watchTranslations(state) {
	const pattern = new vscode.RelativePattern(state.index.i18nDir, '**/*.{ts,json}');
	const watcher = vscode.workspace.createFileSystemWatcher(pattern);
	const onChange = () => void reload(state, false);

	watcher.onDidChange(onChange);
	watcher.onDidCreate(onChange);
	watcher.onDidDelete(onChange);

	return watcher;
}

function watchLanguageFile(state) {
	const file = state.index.languageFile;

	if ('' === file) {
		return [];
	}

	const pattern = new vscode.RelativePattern(path.dirname(file), path.basename(file));
	const watcher = vscode.workspace.createFileSystemWatcher(pattern);

	watcher.onDidChange(() => void reload(state, true));

	return [watcher];
}

const SOURCE_FILE = /\.(?:ts|html)$/;

function watchSources({ findings }) {
	const watcher = vscode.workspace.createFileSystemWatcher('**/*.{ts,html}');
	const onChange = () => findings.schedule({ sources: true });

	watcher.onDidChange(onChange);
	watcher.onDidCreate(onChange);
	watcher.onDidDelete(onChange);

	return [watcher];
}

function watchEdits({ index, findings }) {
	const onEdit = (document) => {
		const file = document.uri.fsPath;
		const sources = SOURCE_FILE.test(file);

		if (sources || file.startsWith(`${index.i18nDir}${path.sep}`)) {
			findings.schedule({ sources });
		}
	};

	return [
		vscode.workspace.onDidChangeTextDocument((event) => onEdit(event.document)),
		vscode.workspace.onDidCloseTextDocument(onEdit),
		vscode.workspace.onDidOpenTextDocument(() => findings.show()),
	];
}

function watchEditors(annotations) {
	let timer = null;

	const schedule = (document) => {
		if (null !== timer) {
			clearTimeout(timer);
		}

		timer = setTimeout(() => annotations.refresh(document), DEBOUNCE);
	};

	return [
		vscode.window.onDidChangeActiveTextEditor((editor) => annotations.refresh(editor?.document)),
		vscode.window.onDidChangeTextEditorSelection((event) => annotations.repaint(event.textEditor)),
		vscode.workspace.onDidChangeTextDocument((event) => schedule(event.document)),
		vscode.workspace.onDidOpenTextDocument((document) => annotations.refresh(document)),
	];
}

function commandTable(state) {
	const { index, annotations, status, usages } = state;

	return {
		filter: () => askFilter(status),
		clearFilter: async () => void status.setFilter(''),
		showPending: async () => status.setPendingOnly(true),
		showAll: async () => status.setPendingOnly(false),
		copyReference: (node) => actions.copyReference(node),
		copyUlid: (node) => actions.copyUlid(node),
		findUsages: (node) => actions.findUsages(index, usages, node),
		openDeclaration: (node) => actions.openDeclaration(index, node),
		openConfig: () => actions.openConfig(index),
		showOutput: async () => show(),
		seal: (node) => seal(index, node),
		collapseAll: async () => status.setFold('collapsed'),
		expandAll: async () => status.setFold('expanded'),
		search: () => searchKeys(index),
		createKey: () => createKey(index, annotations),
		reload: () => reload(state, true),
		toggleInlineText: () => toggleInlineText(annotations),
		exportTranslations: () => exportTranslations(index),
		exportPending: (node) => exportPending(index, node),
		importTranslations: () => importTranslations(index, annotations),
		pruneUnused: (node) => pruneUnused(index, annotations, node),
		openKey: (row) => openKey(index, row),
	};
}

function registerCommands(state) {
	const run =
		(task) =>
		(...args) => {
			task(...args).catch((error) =>
				vscode.window.showErrorMessage(`Transloco ULID i18n: ${error.message}`),
			);
		};

	return [
		...Object.entries(commandTable(state)).map(([name, task]) =>
			vscode.commands.registerCommand(`translocoUlidI18n.${name}`, run(task)),
		),
		vscode.commands.registerCommand('translocoUlidI18n.ensureTemplateSetup', (uri) =>
			run(() => ensureTemplateSetup(uri, state.index.aliases))(),
		),
	];
}

async function toggleInlineText(annotations) {
	const settings = vscode.workspace.getConfiguration('translocoUlidI18n');

	await settings.update('inlineText', true !== settings.get('inlineText', true), true);

	annotations.refreshAll();
}

function showStatus({ status, findings, annotations }) {
	return [
		status,
		status.attach(vscode.window.createTreeView(STATUS_VIEW, { treeDataProvider: status })),
		findings.onDidChange(() => {
			status.refresh();
			annotations.refreshAll();
		}),
	];
}

function subscriptionsOf(state) {
	const { index, annotations, usages, findings } = state;

	return [
		annotations,
		findings,
		hoverProvider(index),
		definitionProvider(index),
		completionProvider(index),
		i18nDefinitionProvider(index, usages),
		i18nReferenceProvider(index, usages),
		watchTranslations(state),
		...watchLanguageFile(state),
		...watchSources(state),
		...watchEdits(state),
		...watchEditors(annotations),
		...showStatus(state),
		...registerCommands(state),
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration('translocoUlidI18n')) {
				void reload(state, true);
			}
		}),
	];
}

async function activate(context) {
	const [folder] = vscode.workspace.workspaceFolders ?? [];

	if (undefined === folder) {
		return;
	}

	const index = new I18nIndex(folder.uri.fsPath);
	const findings = new Findings(index);
	const state = {
		index,
		annotations: new Annotations(index),
		usages: new UsageIndex(index),
		findings,
		status: new StatusView(index),
	};

	await reload(state, true);

	context.subscriptions.push(...subscriptionsOf(state));
}

module.exports = { activate, deactivate: () => undefined };
