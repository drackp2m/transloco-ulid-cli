const vscode = require('vscode');

const { inlineText, inlineTextMaxLength } = require('./settings');
const { shorten, usageDisplay } = require('./util');

const SUPPORTED = new Set(['typescript', 'html']);
const MISSING = '⚠️ missing translation';
const INVALID = '⚠️ invalid ICU';

const hiddenType = vscode.window.createTextEditorDecorationType({
	textDecoration: 'none; display: none;',
});

const inlineType = vscode.window.createTextEditorDecorationType({
	before: {
		color: new vscode.ThemeColor('editorCodeLens.foreground'),
	},
});

const ghostType = vscode.window.createTextEditorDecorationType({
	after: {
		color: new vscode.ThemeColor('editorCodeLens.foreground'),
	},
});

function inlineLabel(index, usage) {
	const entry = index.entry(usage.scope, usage.key);

	if (null === entry) {
		return null;
	}

	const { text, missing } = index.translation(usage.scope, entry.ulid, index.displayLang);

	if (missing) {
		return MISSING;
	}

	try {
		const { text: representative, forms } = index.api.representativeOf(text);

		if (0 === forms.length) {
			return shorten(text, inlineTextMaxLength());
		}

		const marker = ` ‹${forms.join(', ')}›`;

		return `${shorten(representative, Math.max(inlineTextMaxLength() - marker.length, 1))}${marker}`;
	} catch {
		return INVALID;
	}
}

function revealed(range, selections) {
	return selections.some((selection) => undefined !== range.intersection(selection));
}

function collapseInto(groups, range, label) {
	groups.hidden.push(range);
	groups.inline.push({
		range: new vscode.Range(range.start, range.start),
		renderOptions: { before: { contentText: label } },
	});
}

function appendInto(groups, range, label) {
	groups.ghost.push({
		range: new vscode.Range(range.end, range.end),
		renderOptions: { after: { contentText: ` «${label}»` } },
	});
}

function decorationsFor(index, editor, usages) {
	const groups = { hidden: [], inline: [], ghost: [] };

	if (!inlineText()) {
		return groups;
	}

	for (const usage of usages) {
		const label = inlineLabel(index, usage);
		const { range, mode } = usageDisplay(editor.document, usage, index.pipe);

		if (null === label || 'bare' === mode) {
			continue;
		}

		if ('ghost' === mode) {
			appendInto(groups, range, label);
		} else if (!revealed(range, editor.selections)) {
			collapseInto(groups, range, label);
		}
	}

	return groups;
}

class Annotations {
	constructor(index) {
		this.index = index;
	}

	dispose() {
		hiddenType.dispose();
		inlineType.dispose();
		ghostType.dispose();
	}

	refresh(document) {
		for (const editor of vscode.window.visibleTextEditors) {
			if (editor.document === document) {
				this.repaint(editor);
			}
		}
	}

	repaint(editor) {
		if (undefined === editor || !SUPPORTED.has(editor.document.languageId)) {
			return;
		}

		const { document } = editor;
		const usages = this.index.findUsages(document.getText(), document.uri.fsPath);
		const groups = decorationsFor(this.index, editor, usages);

		editor.setDecorations(hiddenType, groups.hidden);
		editor.setDecorations(inlineType, groups.inline);
		editor.setDecorations(ghostType, groups.ghost);
	}

	refreshAll() {
		for (const editor of vscode.window.visibleTextEditors) {
			this.repaint(editor);
		}
	}
}

module.exports = { Annotations };
