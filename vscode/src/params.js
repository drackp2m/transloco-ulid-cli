const vscode = require('vscode');

const settings = require('./settings');

const pipeAhead = (pipe) =>
	new RegExp(`^(\\s*\\|\\s*${pipe.replace(/[$]/g, '\\$&')}(?![\\w$]))(?!\\s*:)(\\s*\\}\\})?`);
const escaped = (name) => name.replace(/[$]/g, '\\$&');
const keyCall = (names) =>
	0 === names.length ? null : new RegExp(`\\b(?:${names.map(escaped).join('|')})\\(\\s*[\\w.]*$`);
const REF_AHEAD = /^\s*\)/;

function paramsObject(params) {
	const fields = params.map(({ name, type }, order) => `${name}: \${${order + 1}:${type}}`);

	return `{ ${fields.join(', ')} }`;
}

function pipeInsertion(key, params, suffix, pipeName) {
	const match = pipeAhead(pipeName).exec(suffix);

	if (null === match) {
		return null;
	}

	const [ahead, pipe, close = ''] = match;
	const args = 0 === params.length ? '' : `: ${paramsObject(params)}`;

	if ('' === args && '' === close) {
		return null;
	}

	return { text: `${key}${pipe}${args}${close}$0`, ahead: ahead.length };
}

function insertion(key, params, { prefix, suffix }, pipe) {
	const call = keyCall(settings.keyFunctions());

	if (0 !== params.length && call?.test(prefix) && REF_AHEAD.test(suffix)) {
		return { text: `${key}, ${paramsObject(params)}$0`, ahead: 0 };
	}

	return pipeInsertion(key, params, suffix, pipe);
}

function replaceRange(document, position, ahead) {
	const word = document.getWordRangeAtPosition(position);

	return new vscode.Range(word?.start ?? position, position.translate(0, ahead));
}

function applyInsertion(index, scope, key, item, context) {
	const insert = insertion(key, index.paramsOf(scope, key), context, index.pipe);

	if (null === insert) {
		return;
	}

	item.insertText = new vscode.SnippetString(insert.text);
	item.range = replaceRange(context.document, context.position, insert.ahead);
}

module.exports = { applyInsertion };
