const { existsSync, readFileSync } = require('node:fs');

const vscode = require('vscode');

const { NEW_SCOPE, createScope } = require('./create-scope');
const { importEdit } = require('./imports');
const { ensureTemplateSetup } = require('./setup');

const SOURCE_LANGUAGES = new Set(['html', 'typescript']);
const QUOTED = /^(['"`])([\s\S]*)\1$/;
const REQUIRED = 'Required';
const rawScopeOf = (index, name) =>
	index.rawScopes.find((scope) => scope.name === name) ?? { name, keys: null };

async function pickScope(index, document) {
	const names = index.scopeNames();
	const guess = names.find((name) => document?.uri.fsPath.includes(`${name}.page.`));

	const picked = await vscode.window.showQuickPick([...names, NEW_SCOPE], {
		title: 'i18n scope',
		placeHolder: guess ?? names[0] ?? NEW_SCOPE,
	});

	if (undefined === picked) {
		return null;
	}

	return NEW_SCOPE === picked ? createScope(index) : picked;
}

async function askName(index, scope) {
	return vscode.window.showInputBox({
		title: `New key in ${scope}`,
		placeHolder: 'SECTION_TITLE',
		validateInput: (value) => index.api.keyNameProblem(rawScopeOf(index, scope), value),
	});
}

async function askKind() {
	const picked = await vscode.window.showQuickPick(
		[
			{ label: 'Text', kind: 'plain' },
			{ label: 'Plural', kind: 'plural' },
		],
		{ title: 'Key kind' },
	);

	return picked?.kind ?? null;
}

async function askPluralArgument(index, name) {
	return vscode.window.showInputBox({
		title: `${name} · plural param`,
		value: 'count',
		validateInput: (value) => index.api.paramNameProblem(value),
	});
}

function validateForm(api, argument, category, text) {
	const problem = api.formProblem(argument, category, text);

	if (null !== problem) {
		return problem;
	}

	const doubt = api.formDoubt(argument, category, text);

	return null === doubt
		? null
		: { message: doubt, severity: vscode.InputBoxValidationSeverity.Warning };
}

function numberHint(argument, lang) {
	const { format } = new Intl.NumberFormat(lang);
	const param = `{${argument}}`;
	const local = `${format(10000)} · ${format(1.5)}`;

	return `# shows ${param} the ${lang} way (${local}); ${param} shows it raw (10000 · 1.5)`;
}

async function askPluralForms({ index, name, argument, seed }) {
	const forms = new Map();
	const hint = numberHint(argument, index.defaultLang);
	let previous = '';

	for (const category of index.api.formsToAsk(index.defaultLang)) {
		const start = '' === seed ? previous : seed;
		const value = await vscode.window.showInputBox({
			title: `${name} · ${index.defaultLang} · ${category}`,
			value: start,
			valueSelection: [start.length, start.length],
			prompt: hint,
			validateInput: (text) => validateForm(index.api, argument, category, text),
		});

		if (undefined === value) {
			return null;
		}

		forms.set(category, value);
		previous = value;
	}

	return forms;
}

async function askPluralText(index, name, seed) {
	const argument = await askPluralArgument(index, name);

	if (undefined === argument) {
		return null;
	}

	const forms = await askPluralForms({ index, name, argument, seed });

	return null === forms ? null : index.api.pluralSource(argument, forms);
}

async function askText(index, name, seed) {
	const value = await vscode.window.showInputBox({
		title: `${name} · ${index.defaultLang}`,
		value: seed,
		valueSelection: [seed.length, seed.length],
		prompt: REQUIRED,
		validateInput: (text) =>
			index.api.textProblems(text, index.defaultLang, index.langs)[0] ?? null,
	});

	return value ?? null;
}

function seedOf(editor) {
	if (undefined === editor || editor.selection.isEmpty) {
		return '';
	}

	const text = editor.document.getText(editor.selection).trim();

	return 'typescript' === editor.document.languageId ? text.replace(QUOTED, '$2') : text;
}

async function askKey(index, editor) {
	const scopeName = await pickScope(index, editor?.document);

	if (null === scopeName) {
		return null;
	}

	const name = await askName(index, scopeName);
	const kind = undefined === name ? null : await askKind();

	if (null === kind) {
		return null;
	}

	const seed = seedOf(editor);
	const text =
		'plural' === kind ? await askPluralText(index, name, seed) : await askText(index, name, seed);

	return null === text ? null : { scopeName, name, text, editor };
}

function planOf(index, { scopeName, name, text }) {
	const planned = index.api.planKey({
		scope: rawScopeOf(index, scopeName),
		name,
		text,
		langs: index.langs,
		defaultLang: index.defaultLang,
	});

	if (0 !== planned.problems.length) {
		throw new Error(planned.problems.join('; '));
	}

	return planned;
}

function reference(document, scope, name, pipe) {
	const expression = `I18n.${scope}.${name}`;

	return 'html' === document?.languageId ? `{{ ${expression} | ${pipe} }}` : expression;
}

function pipeSnippet(pipe, scopeName, name, params) {
	const opening = `{{ I18n.${scopeName}.${name} | ${pipe}: { `;
	const snippet = new vscode.SnippetString().appendText(opening);

	params.forEach((param, order) => {
		snippet.appendText(`${0 === order ? '' : ', '}${param}: `);
		snippet.appendTabstop(order + 1);
	});

	return snippet.appendText(' } }}');
}

function referenceEdits(edit, index, editor, scopeName, name) {
	const { document, selection } = editor;

	edit.replace(document.uri, selection, reference(document, scopeName, name, index.pipe));

	if ('typescript' !== document.languageId) {
		return;
	}

	const { i18n, app } = index.aliases;
	const change = importEdit(document, i18n, `import { I18n } from '${i18n}';`, app);

	if (null !== change) {
		edit.replace(document.uri, change.range, change.newText);
	}
}

function wholeRange(file) {
	const open = vscode.workspace.textDocuments.find((document) => document.uri.fsPath === file);
	const lines = open?.lineCount ?? readFileSync(file, 'utf8').split('\n').length;

	return new vscode.Range(0, 0, lines, 0);
}

function buildEdit(index, planned, { scopeName, name, editor }) {
	const edit = new vscode.WorkspaceEdit();
	const existing = planned.writes.filter((write) => existsSync(write.file));

	for (const write of existing) {
		edit.replace(vscode.Uri.file(write.file), wholeRange(write.file), write.content);
	}

	const inserted = undefined !== editor && SOURCE_LANGUAGES.has(editor.document.languageId);
	const { params } = planned;
	const snippet =
		inserted && 'html' === editor.document.languageId && 0 !== params.length
			? pipeSnippet(index.pipe, scopeName, name, params)
			: null;

	if (inserted && null === snippet) {
		referenceEdits(edit, index, editor, scopeName, name);
	}

	const created = planned.writes.filter((write) => !existing.includes(write));

	return { edit, saved: existing.map((write) => write.file), created, inserted, snippet };
}

async function save(files) {
	for (const file of files) {
		const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file));

		await document.save();
	}
}

async function writeAll(built) {
	await vscode.workspace.applyEdit(built.edit);
	await save(built.saved);

	for (const write of built.created) {
		await vscode.workspace.fs.writeFile(
			vscode.Uri.file(write.file),
			Buffer.from(write.content, 'utf8'),
		);
	}
}

async function placeReference(index, editor, built) {
	if (null !== built.snippet) {
		await editor.insertSnippet(built.snippet, editor.selection);
	}

	if (built.inserted && 'html' === editor.document.languageId) {
		await ensureTemplateSetup(editor.document.uri, index.aliases);
	}
}

async function revealText(file, id) {
	const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
	const marker = `"${id}": `;
	const line = Math.max(
		document
			.getText()
			.split('\n')
			.findIndex((text) => text.includes(marker)),
		0,
	);
	const found = document.lineAt(line).text.indexOf(marker);
	const position = new vscode.Position(line, -1 === found ? 0 : found + marker.length);

	await vscode.window.showTextDocument(document, {
		selection: new vscode.Range(position, position),
	});
}

async function announce(index, { scopeName, name }, planned) {
	const file = index.scopes.get(scopeName)?.translations.get(index.defaultLang)?.file;
	const action = `Open ${index.defaultLang}.json`;
	const message = [`i18n: ${scopeName}.${name} created`, ...planned.warnings].join('. ');
	const picked =
		0 === planned.warnings.length
			? await vscode.window.showInformationMessage(message, action)
			: await vscode.window.showWarningMessage(message, action);

	if (action === picked && undefined !== file) {
		await revealText(file, planned.ulid);
	}
}

async function createKey(index, annotations) {
	const key = await askKey(index, vscode.window.activeTextEditor);

	if (null === key) {
		return;
	}

	const planned = planOf(index, key);
	const built = buildEdit(index, planned, key);

	await writeAll(built);
	await placeReference(index, key.editor, built);
	await index.reload();

	annotations.refreshAll();
	void announce(index, key, planned);
}

module.exports = { createKey };
