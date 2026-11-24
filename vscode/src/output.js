const vscode = require('vscode');

const NAME = 'Transloco ULID i18n';

let channel = null;

function output() {
	channel = channel ?? vscode.window.createOutputChannel(NAME);

	return channel;
}

function report(lines) {
	const target = output();

	target.clear();

	for (const line of lines) {
		target.appendLine(line);
	}

	return target;
}

function reveal(lines) {
	report(lines).show(true);
}

const show = () => output().show(true);

function fail(message) {
	reveal([message]);

	void vscode.window.showErrorMessage(`${NAME}: ${message}`);
}

module.exports = { fail, report, reveal, show };
