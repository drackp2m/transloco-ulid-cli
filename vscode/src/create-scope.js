const path = require('node:path');

const vscode = require('vscode');

const { importEdit } = require('./imports');

const NEW_SCOPE = '$(add) New scope…';
const SCOPE_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const BARREL_END = '} as const;';
const BARREL_ENTRY = /^\t([a-zA-Z0-9]+):/;
const PARAMS_UNION = /^type I18nParams = (.+);$/;

const toCamelCase = (name) => name.replace(/-([a-z0-9])/g, (_match, char) => char.toUpperCase());

function toPascalCase(name) {
	const camel = toCamelCase(name);

	return camel.charAt(0).toUpperCase() + camel.slice(1);
}

async function askScopeName(index) {
	return vscode.window.showInputBox({
		title: 'New i18n scope',
		placeHolder: 'dashboard',
		validateInput: (value) => {
			if (!SCOPE_NAME.test(value)) {
				return 'Use kebab-case';
			}

			return index.scopeNames().includes(value) ? `${value} already exists` : null;
		},
	});
}

async function writeFile(file, content) {
	await vscode.workspace.fs.writeFile(vscode.Uri.file(file), Buffer.from(content, 'utf8'));
}

async function createFiles(index, name) {
	const dir = path.join(index.i18nDir, name);

	await writeFile(
		path.join(dir, 'keys.ts'),
		`export const ${toPascalCase(name)}I18n = {\n${BARREL_END}\n`,
	);

	await writeFile(
		path.join(dir, 'params.ts'),
		`export type ${toPascalCase(name)}I18nParams = Record<never, never>;\n`,
	);

	for (const lang of index.langs) {
		await writeFile(path.join(dir, `${lang}.json`), '{}\n');
	}
}

function barrelPropertyEdit(document, name) {
	const lines = document.getText().split('\n');
	const end = lines.findIndex((line) => line.startsWith(BARREL_END));

	if (-1 === end) {
		throw new Error(`Cannot find "${BARREL_END}" in the i18n barrel`);
	}

	const property = toCamelCase(name);
	const entries = lines
		.map((line, position) => ({ position, key: BARREL_ENTRY.exec(line)?.[1] }))
		.filter((entry) => undefined !== entry.key && entry.position < end);
	const next = entries.find((entry) => entry.key > property);

	return vscode.TextEdit.insert(
		new vscode.Position(next?.position ?? end, 0),
		`\t${property}: ${toPascalCase(name)}I18n,\n`,
	);
}

function barrelParamsEdit(document, name) {
	const lines = document.getText().split('\n');
	const position = lines.findIndex((line) => PARAMS_UNION.test(line));

	if (-1 === position) {
		throw new Error('Cannot find the I18nParams union in the i18n barrel');
	}

	const line = lines[position];
	const members = [...PARAMS_UNION.exec(line)[1].split(' & '), `${toPascalCase(name)}I18nParams`];

	return vscode.TextEdit.replace(
		new vscode.Range(new vscode.Position(position, 0), new vscode.Position(position, line.length)),
		`type I18nParams = ${members.sort().join(' & ')};`,
	);
}

function barrelEdits(document, name, aliases) {
	const constant = `${aliases.i18n}/${name}/keys`;
	const params = `${aliases.i18n}/${name}/params`;

	return [
		importEdit(
			document,
			constant,
			`import { ${toPascalCase(name)}I18n } from '${constant}';`,
			aliases.app,
		),
		importEdit(
			document,
			params,
			`import type { ${toPascalCase(name)}I18nParams } from '${params}';`,
			aliases.app,
		),
		barrelPropertyEdit(document, name),
		barrelParamsEdit(document, name),
	].filter((change) => null !== change);
}

async function editBarrel(index, name) {
	const file = path.join(index.i18nDir, 'index.ts');
	const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
	const edit = new vscode.WorkspaceEdit();

	edit.set(document.uri, barrelEdits(document, name, index.aliases));

	await vscode.workspace.applyEdit(edit);
	await document.save();
}

async function createScope(index) {
	const name = await askScopeName(index);

	if (undefined === name) {
		return null;
	}

	await createFiles(index, name);
	await editBarrel(index, name);
	await index.reload();

	return name;
}

module.exports = { NEW_SCOPE, createScope };
