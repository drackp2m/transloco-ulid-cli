const { existsSync } = require('node:fs');
const path = require('node:path');

const vscode = require('vscode');

const SECTION = 'translocoUlidI18n';
const LANGUAGE_TAG = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

const read = (name, fallback) => vscode.workspace.getConfiguration(SECTION).get(name, fallback);

const inlineText = () => true === read('inlineText', true);

const inlineTextMaxLength = () => read('inlineTextMaxLength', 60);

const transferDir = () => read('transferDir', 'translations');

const pipeImport = () => String(read('pipeImport', '@jsverse/transloco')).trim();

const pipeClass = () => String(read('pipeClass', 'TranslocoPipe')).trim();

function keyFunctions() {
	const configured = read('keyFunctions', ['translate']);

	return Array.isArray(configured)
		? configured.map((name) => String(name).trim()).filter(Boolean)
		: [];
}

function cliDir(root) {
	const configured = String(read('cliDir', '')).trim();

	if ('' === configured) {
		return null;
	}

	return path.isAbsolute(configured) ? configured : path.join(root, configured);
}

function languageFile(root, defaults) {
	const configured = String(read('languageFile', '')).trim();

	if ('' === configured) {
		return defaults.languageFile;
	}

	return path.isAbsolute(configured) ? configured : path.join(root, configured);
}

function checkLanguages({ langs, defaultLang }, file) {
	const malformed = langs.filter((lang) => !LANGUAGE_TAG.test(lang));

	if (malformed.length) {
		throw new Error(`${file}: LANGUAGES declares malformed tags (${malformed.join(', ')})`);
	}

	if (!langs.includes(defaultLang)) {
		throw new Error(`${file}: DEFAULT_LANGUAGE "${defaultLang}" is not listed in LANGUAGES`);
	}

	return { langs, defaultLang };
}

function readLanguages(config, file) {
	if (!existsSync(file)) {
		throw new Error(`${SECTION}.languageFile points at "${file}", which does not exist`);
	}

	return checkLanguages(config.readLanguages(file), file);
}

function resolveLangs(available, defaultLang) {
	const configured = read('langs', []);

	if (0 === configured.length) {
		return available;
	}

	const unknown = configured.filter((lang) => !available.includes(lang));

	if (unknown.length) {
		const list = unknown.join(', ');

		throw new Error(`${SECTION}.langs lists what LANGUAGES does not declare: ${list}`);
	}

	if (!configured.includes(defaultLang)) {
		throw new Error(`${SECTION}.langs has to include the source language "${defaultLang}"`);
	}

	return configured;
}

function resolveDisplayLang(langs, defaultLang) {
	const configured = String(read('displayLang', '')).trim();

	if ('' === configured) {
		return defaultLang;
	}

	if (!langs.includes(configured)) {
		throw new Error(`${SECTION}.displayLang is "${configured}", which is not a resolved language`);
	}

	return configured;
}

module.exports = {
	cliDir,
	inlineText,
	inlineTextMaxLength,
	keyFunctions,
	languageFile,
	pipeClass,
	pipeImport,
	readLanguages,
	resolveDisplayLang,
	resolveLangs,
	transferDir,
};
