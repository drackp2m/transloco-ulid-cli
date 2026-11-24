const { existsSync } = require('node:fs');
const path = require('node:path');

const vscode = require('vscode');

const { keyTargets } = require('./navigation');

const CONFIG_FILE = 'i18n.config.json';

const keyOf = (node) => node?.row ?? node?.entry ?? null;

const toCamelCase = (name) => name.replace(/-([a-z0-9])/g, (_match, char) => char.toUpperCase());

async function copy(text) {
	await vscode.env.clipboard.writeText(text);
	vscode.window.setStatusBarMessage(`i18n: copied ${text}`, 3000);
}

async function copyReference(node) {
	const key = keyOf(node);

	if (null !== key) {
		await copy(`I18n.${toCamelCase(key.scope)}.${key.name}`);
	}
}

async function copyUlid(node) {
	const key = keyOf(node);

	if (null !== key) {
		await copy(key.ulid);
	}
}

const reveal = ({ uri, range }) => vscode.window.showTextDocument(uri, { selection: range });

function declarationOf(index, key) {
	const [location] = keyTargets(index, index.scopes.get(key.scope), key.ulid);

	return location ?? null;
}

async function openDeclaration(index, node) {
	const key = keyOf(node);
	const location = null === key ? null : declarationOf(index, key);

	if (null !== location) {
		await reveal(location);
	}
}

async function findUsages(index, usages, node) {
	const key = keyOf(node);

	if (null === key) {
		return;
	}

	const locations = usages.locationsOf(key.scope, key.name);
	const origin = declarationOf(index, key);

	if (0 === locations.length || null === origin) {
		vscode.window.showInformationMessage(`i18n: nothing references ${key.scope}.${key.name}`);

		return;
	}

	if (1 === locations.length) {
		await reveal(locations[0]);

		return;
	}

	await reveal(origin);
	await vscode.commands.executeCommand(
		'editor.action.showReferences',
		origin.uri,
		origin.range.start,
		locations,
	);
}

async function openConfig(index) {
	const file = '' === index.configFile ? path.join(index.root, CONFIG_FILE) : index.configFile;

	if (!existsSync(file)) {
		throw new Error(`there is no ${CONFIG_FILE} in ${index.root}`);
	}

	await vscode.window.showTextDocument(vscode.Uri.file(file));
}

module.exports = { copyReference, copyUlid, findUsages, openConfig, openDeclaration };
