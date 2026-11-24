const path = require('node:path');

const vscode = require('vscode');

const { reveal } = require('./output');
const { count, shorten } = require('./util');

const NEEDED = 'removing keys needs @drackp2m/transloco-ulid-cli 0.5.0 or later';
const NAMES_SHOWN = 10;
const SOURCE_PREVIEW = 60;
const REMOVE_ALL = 'Remove all';
const SELECT = 'Select…';
const WHAT_GOES = [
	'Their lines in keys.ts, every translation, their seals and their params.ts entries go.',
	'A key may be unused because a refactor lost its usage.',
].join(' ');
const PARAMS_LEFT = 'params.ts had pending changes and was left untouched';

const scopeOfNode = (node) => node?.scope?.name ?? node?.scope ?? null;

function unusedKeys(index, scope = null) {
	return index.analysis.findings
		.filter((finding) => 'unused-key' === finding.type && null !== finding.key)
		.filter((finding) => null === scope || finding.scope === scope)
		.map(({ scope: name, key, ulid }) => ({ scope: name, key, ulid }));
}

const labelOf = ({ scope, key }) => `${scope}.${key}`;

function dirtyIn(dir) {
	return vscode.workspace.textDocuments
		.filter((document) => document.isDirty && document.uri.fsPath.startsWith(`${dir}${path.sep}`))
		.map((document) => path.basename(document.uri.fsPath));
}

async function askHow(keys) {
	const names = keys.slice(0, NAMES_SHOWN).map(labelOf).join(', ');
	const more = keys.length > NAMES_SHOWN ? `, and ${keys.length - NAMES_SHOWN} more` : '';
	const detail = `${names}${more}.\n\n${WHAT_GOES}`;

	return vscode.window.showWarningMessage(
		`Remove ${count(keys.length, 'unused key')}?`,
		{ modal: true, detail },
		REMOVE_ALL,
		SELECT,
	);
}

async function pickKeys(index, keys) {
	const picked = await vscode.window.showQuickPick(
		keys.map((item) => ({
			label: labelOf(item),
			description: shorten(
				index.translation(item.scope, item.ulid, index.defaultLang).text ?? '',
				SOURCE_PREVIEW,
			),
			picked: true,
			item,
		})),
		{ title: 'Keys nothing uses — untick the ones to keep', canPickMany: true },
	);

	return picked?.map(({ item }) => item) ?? [];
}

async function chosenOf(index, keys) {
	const answer = await askHow(keys);

	if (REMOVE_ALL === answer) {
		return keys;
	}

	return SELECT === answer ? pickKeys(index, keys) : [];
}

function reportPruned(plan) {
	const message = `i18n: ${count(plan.keys.length, 'key')} removed`;

	if (0 === plan.paramsLeft.length) {
		vscode.window.showInformationMessage(message);

		return;
	}

	reveal(plan.paramsLeft.map((scope) => `${scope}: ${PARAMS_LEFT}`));
	vscode.window.showWarningMessage(`${message} — ${PARAMS_LEFT}, see the output channel`);
}

async function pruneUnused(index, annotations, node) {
	const keys = unusedKeys(index, scopeOfNode(node));
	const dirty = dirtyIn(index.i18nDir);

	if ('function' !== typeof index.api?.planPrune) {
		throw new Error(NEEDED);
	}

	if (0 !== dirty.length) {
		throw new Error(`save ${dirty.join(', ')} first — removing keys writes those files`);
	}

	if (0 === keys.length) {
		vscode.window.showInformationMessage('i18n: every key is used');

		return;
	}

	const chosen = await chosenOf(index, keys);

	if (0 === chosen.length) {
		return;
	}

	const plan = index.api.planPrune({ ...index.project, scopes: index.rawScopes, keys: chosen });

	index.api.applyPrune({ plan });
	await index.reload();
	annotations.refreshAll();
	reportPruned(plan);
}

module.exports = { pruneUnused, unusedKeys };
