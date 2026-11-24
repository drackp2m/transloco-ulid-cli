const vscode = require('vscode');

const { importEdit } = require('./imports');

const interpolationOf = (pipe) => `{{ I18n.$0 | ${pipe} }}`;
const EXPRESSION = 'I18n.$0';

function inTag(prefix) {
	const open = prefix.lastIndexOf('<');

	return -1 !== open && open > prefix.lastIndexOf('>');
}

function inInterpolation(prefix) {
	const open = prefix.lastIndexOf('{{');

	return -1 !== open && open > prefix.lastIndexOf('}}');
}

function htmlSnippet(document, prefix, pipe) {
	if (inTag(prefix)) {
		return null;
	}

	const text = inInterpolation(prefix) ? EXPRESSION : interpolationOf(pipe);

	const item = new vscode.CompletionItem(
		{ label: 'i18n', description: text },
		vscode.CompletionItemKind.Snippet,
	);

	item.insertText = new vscode.SnippetString(text);
	item.detail = 'transloco key + component wiring';
	item.command = {
		command: 'translocoUlidI18n.ensureTemplateSetup',
		title: 'Wire the component up',
		arguments: [document.uri],
	};

	return item;
}

function typescriptSnippet(document, aliases) {
	const item = new vscode.CompletionItem(
		{ label: 'i18n', description: EXPRESSION },
		vscode.CompletionItemKind.Snippet,
	);

	item.insertText = new vscode.SnippetString(EXPRESSION);
	item.detail = 'transloco key + import';
	item.additionalTextEdits = [
		importEdit(document, aliases.i18n, `import { I18n } from '${aliases.i18n}';`, aliases.app),
	].filter((edit) => null !== edit);

	return item;
}

function snippetItems(document, prefix, { aliases, pipe }) {
	const item =
		'html' === document.languageId
			? htmlSnippet(document, prefix, pipe)
			: typescriptSnippet(document, aliases);

	if (null === item) {
		return [];
	}

	item.filterText = 'i18n';
	item.sortText = '0000';

	return [item];
}

module.exports = { snippetItems };
