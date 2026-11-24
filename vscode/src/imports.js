const vscode = require('vscode');

const IMPORT_LINE = /^import\b.*from '([^']+)';/;

const rankerOf = (appPrefix) => (specifier) => (specifier.startsWith(appPrefix) ? 1 : 0);

function importLines(text) {
	return text.split('\n').flatMap((line, index) => {
		const [, specifier] = IMPORT_LINE.exec(line) ?? [];

		return undefined === specifier ? [] : [{ index, specifier }];
	});
}

function newGroupPlacement(lines, specifier, rankOf) {
	const [first] = lines;

	if (undefined === first) {
		return { line: 0, before: '', after: '\n\n' };
	}

	return 0 === rankOf(specifier)
		? { line: first.index, before: '', after: '\n\n' }
		: { line: lines.at(-1).index + 1, before: '\n', after: '\n' };
}

function placement(lines, specifier, rankOf) {
	const group = lines.filter((line) => rankOf(line.specifier) === rankOf(specifier));
	const next = group.find((line) => line.specifier > specifier);

	if (undefined !== next) {
		return { line: next.index, before: '', after: '\n' };
	}

	return 0 === group.length
		? newGroupPlacement(lines, specifier, rankOf)
		: { line: group.at(-1).index + 1, before: '', after: '\n' };
}

function importEdit(document, specifier, statement, appPrefix) {
	const text = document.getText();

	if (text.includes(`from '${specifier}'`)) {
		return null;
	}

	const { line, before, after } = placement(importLines(text), specifier, rankerOf(appPrefix));
	const position = new vscode.Position(Math.min(line, document.lineCount), 0);

	return vscode.TextEdit.insert(position, `${before}${statement}${after}`);
}

module.exports = { importEdit };
