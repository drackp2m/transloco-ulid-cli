const { existsSync } = require('node:fs');

const vscode = require('vscode');

const { importEdit } = require('./imports');

const CLASS_BODY = /export class \w+[^{]*\{/;
const COMPONENT_HEAD = /@Component\(\{\n/;
const DECORATOR_PROPERTY = /^\t(?:selector|templateUrl|styleUrl):[^\n]*\n/gm;
const IMPORTS_ARRAY = /imports:\s*\[([^\]]*)\]/;

function decoratorInsertPoint(text) {
	const properties = [...text.matchAll(DECORATOR_PROPERTY)];
	const last = properties.at(-1);

	if (undefined !== last) {
		return last.index + last[0].length;
	}

	const head = COMPONENT_HEAD.exec(text);

	return null === head ? null : head.index + head[0].length;
}

function pipeArrayEdit(document, pipeClass) {
	const text = document.getText();
	const match = IMPORTS_ARRAY.exec(text);

	if (null === match) {
		const offset = decoratorInsertPoint(text);

		return null === offset
			? null
			: vscode.TextEdit.insert(document.positionAt(offset), `\timports: [${pipeClass}],\n`);
	}

	const separator = '' === match[1].trim() ? '' : ', ';

	return vscode.TextEdit.insert(
		document.positionAt(match.index + match[0].length - 1),
		`${separator}${pipeClass}`,
	);
}

function fieldEdit(document) {
	const text = document.getText();

	if (/readonly I18n = I18n\b/.test(text)) {
		return null;
	}

	const match = CLASS_BODY.exec(text);

	return null === match
		? null
		: vscode.TextEdit.insert(
				document.positionAt(match.index + match[0].length),
				'\n\tprotected readonly I18n = I18n;\n',
			);
}

const mentions = (text, name) => new RegExp(`\\b${name.replace(/[$]/g, '\\$&')}\\b`).test(text);

function componentEdits(document, aliases) {
	const { pipe, pipeClass } = aliases;
	const usesPipe = mentions(document.getText(), pipeClass);

	return [
		usesPipe
			? null
			: importEdit(document, pipe, `import { ${pipeClass} } from '${pipe}';`, aliases.app),
		usesPipe ? null : pipeArrayEdit(document, pipeClass),
		importEdit(document, aliases.i18n, `import { I18n } from '${aliases.i18n}';`, aliases.app),
		fieldEdit(document),
	].filter((edit) => null !== edit && undefined !== edit);
}

async function ensureTemplateSetup(uri, aliases) {
	const file = uri.fsPath.replace(/\.html$/, '.ts');

	if (!existsSync(file)) {
		return;
	}

	const document = await vscode.workspace.openTextDocument(file);
	const edits = componentEdits(document, aliases);

	if (0 === edits.length) {
		return;
	}

	const workspaceEdit = new vscode.WorkspaceEdit();

	workspaceEdit.set(document.uri, edits);

	await vscode.workspace.applyEdit(workspaceEdit);
}

module.exports = { ensureTemplateSetup };
