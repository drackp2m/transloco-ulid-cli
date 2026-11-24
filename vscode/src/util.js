const { readFileSync } = require('node:fs');

const vscode = require('vscode');

const SELECTOR = [
	{ scheme: 'file', language: 'typescript' },
	{ scheme: 'file', language: 'html' },
];

function locate(file, needle) {
	if (null === file) {
		return null;
	}

	let lines;

	try {
		lines = readFileSync(file, 'utf8').split('\n');
	} catch {
		return null;
	}

	const line = lines.findIndex((content) => content.includes(needle));

	if (-1 === line) {
		return new vscode.Location(vscode.Uri.file(file), new vscode.Position(0, 0));
	}

	const character = lines[line].indexOf(needle);

	return new vscode.Location(vscode.Uri.file(file), new vscode.Position(line, character));
}

const INTERPOLATION_OPEN = '{{';
const INTERPOLATION_CLOSE = '}}';

const escaped = (name) => name.replace(/[$]/g, '\\$&');

const pipedNext = (after, pipe) => new RegExp(`^\\s*\\|\\s*${escaped(pipe)}(?![\\w$])`).test(after);

function insideInterpolation(text, start) {
	const opened = text.lastIndexOf(INTERPOLATION_OPEN, start);

	return -1 !== opened && opened > text.lastIndexOf(INTERPOLATION_CLOSE, start);
}

function usageDisplay(document, usage, pipe) {
	const text = document.getText();
	const range = usageRange(document, usage);

	if (usage.bare) {
		return { range, mode: 'bare' };
	}

	const collapses =
		'html' !== document.languageId ||
		pipedNext(text.slice(usage.end), pipe) ||
		!insideInterpolation(text, usage.start);

	return { range, mode: collapses ? 'collapse' : 'ghost' };
}

const count = (value, word) => `${value} ${word}${1 === value ? '' : 's'}`;

function displayFirst({ langs, displayLang }) {
	return langs.includes(displayLang)
		? [displayLang, ...langs.filter((lang) => lang !== displayLang)]
		: langs;
}

function shorten(text, max) {
	const flat = String(text).replace(/\s+/g, ' ').trim();

	return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function usageAt(index, document, position) {
	const offset = document.offsetAt(position);

	return (
		index
			.findUsages(document.getText(), document.uri.fsPath)
			.find((usage) => offset >= usage.start && offset <= usage.end) ?? null
	);
}

function usageRange(document, usage) {
	return new vscode.Range(document.positionAt(usage.start), document.positionAt(usage.end));
}

module.exports = {
	SELECTOR,
	count,
	displayFirst,
	locate,
	shorten,
	usageAt,
	usageDisplay,
	usageRange,
};
