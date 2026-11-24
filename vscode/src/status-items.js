const path = require('node:path');

const vscode = require('vscode');

const {
	SEVERITIES,
	STATUSES,
	UNUSED,
	mergedKeys,
	pendingOf,
	percentOf,
	progressOf,
} = require('./status-data');
const { ringIcon } = require('./status-icon');
const { isSealable, rowsOf } = require('./status-seal');
const { count, shorten } = require('./util');

const SOURCE_PREVIEW = 50;
const TEXT_PREVIEW = 70;
const MESSAGE_PREVIEW = 80;
const { Collapsed, Expanded, None } = vscode.TreeItemCollapsibleState;

const themed = (icon, color) =>
	new vscode.ThemeIcon(icon, undefined === color ? undefined : new vscode.ThemeColor(color));

const STATUS_LOOK = {
	missing: {
		label: 'Untranslated',
		tint: '#f14c4c',
		icon: themed('warning', 'problemsErrorIcon.foreground'),
	},
	stale: {
		label: 'Outdated',
		tint: '#cca700',
		icon: themed('warning', 'problemsWarningIcon.foreground'),
	},
	unknown: {
		label: 'Never sealed',
		tint: '#8c8c8c',
		icon: themed('question', 'descriptionForeground'),
	},
	fresh: { label: 'Up to date', tint: '#73c991', icon: themed('pass', 'testing.iconPassed') },
	unused: {
		label: 'Unused',
		tint: '#8c8c8c',
		icon: themed('circle-slash', 'disabledForeground'),
	},
};

const SEVERITY_LOOK = {
	error: { word: 'error', symbol: '✖', icon: themed('error', 'problemsErrorIcon.foreground') },
	warning: {
		word: 'warning',
		symbol: '⚠',
		icon: themed('warning', 'problemsWarningIcon.foreground'),
	},
	info: { word: 'note', symbol: 'ℹ', icon: themed('info', 'problemsInfoIcon.foreground') },
};

function openCommand(file, line, col) {
	const position = new vscode.Position(Math.max((line ?? 1) - 1, 0), Math.max((col ?? 1) - 1, 0));
	const selection = new vscode.Range(position, position);

	return {
		command: 'vscode.open',
		title: 'Open',
		arguments: [vscode.Uri.file(file), { selection }],
	};
}

function describe(keys) {
	const pending = pendingOf(keys);

	if (0 !== pending) {
		return `${pending} pending`;
	}

	return 0 === keys.unknown.length ? 'up to date' : `${keys.unknown.length} never sealed`;
}

const shareOf = ({ total, fresh, translated }) =>
	`${percentOf(fresh, total)} % up to date · ${percentOf(translated, total)} % translated`;

function markdown(blocks) {
	const tooltip = new vscode.MarkdownString(blocks.join('\n\n'), true);

	tooltip.supportHtml = true;

	return tooltip;
}

function statusLine(status, total) {
	const { label, tint, icon } = STATUS_LOOK[status];

	return `<span style="color:${tint};">$(${icon.id})</span> ${total} ${label.toLowerCase()}`;
}

function languageTooltip(language, scope, progress) {
	const where = null === scope ? '' : ` · ${scope}`;
	const lines = STATUSES.filter((status) => 0 !== language.keys[status].length).map((status) =>
		statusLine(status, language.keys[status].length),
	);
	const header = `**${language.lang}**${where} · ${count(progress.total, 'key')}`;
	const unused = language.keys[UNUSED]?.length ?? 0;
	const aside = 0 === unused ? [] : [`${statusLine(UNUSED, unused)}, not counted`];

	return markdown([header, shareOf(progress), [...lines, ...aside].join('  \n')]);
}

function languageItem({ language, scope }) {
	const progress = language.progress ?? progressOf(language.keys);
	const item = new vscode.TreeItem(language.lang, Collapsed);

	item.description = describe(language.keys);
	item.iconPath = ringIcon(progress);
	item.tooltip = languageTooltip(language, scope, progress);
	item.contextValue =
		0 === (language.pending ?? pendingOf(language.keys)) ? 'language' : 'languagePending';

	return item;
}

function statusContext(status) {
	if (UNUSED === status) {
		return 'statusUnused';
	}

	return isSealable({ status }) ? 'statusSealable' : 'status';
}

function statusItem({ status, language }) {
	const item = new vscode.TreeItem(STATUS_LOOK[status].label, Collapsed);

	item.description = String(language.keys[status].length);
	item.iconPath = STATUS_LOOK[status].icon;
	item.contextValue = statusContext(status);

	return item;
}

function keyTooltip(index, row) {
	const tooltip = new vscode.MarkdownString(`\`${row.scope}.${row.name}\``);

	for (const lang of [index.defaultLang, row.lang]) {
		const text = String(index.translation(row.scope, row.ulid, lang).text ?? '').trim();

		tooltip.appendMarkdown(`\n\n**${lang}** `);
		tooltip.appendText('' === text ? '(empty)' : text);
	}

	return tooltip;
}

function keyItem({ row }, index) {
	const item = new vscode.TreeItem(row.name, None);
	const { text } = index.translation(row.scope, row.ulid, index.defaultLang);

	item.description = `${row.scope} · ${shorten(text ?? '', SOURCE_PREVIEW)}`;
	item.tooltip = keyTooltip(index, row);
	item.command = { command: 'translocoUlidI18n.openKey', title: 'Open', arguments: [row] };
	item.contextValue = isSealable(row) ? 'keySealable' : 'key';

	return item;
}

function scopeItem({ scope }) {
	const progress = scope.progress ?? progressOf(mergedKeys(scope.languages));
	const item = new vscode.TreeItem(scope.name, Collapsed);
	const langs = count(scope.languages.length, 'target language');
	const header = `**${scope.name}** · ${count(scope.keys, 'key')} in ${langs}`;

	item.description = count(scope.keys, 'key');
	item.tooltip = markdown(0 === progress.total ? [header] : [header, shareOf(progress)]);
	item.iconPath = ringIcon(progress);
	item.contextValue = 0 === rowsOf({ kind: 'scope', scope }).length ? 'scope' : 'scopeSealable';

	return item;
}

function sourceItem({ snapshot }) {
	const item = new vscode.TreeItem('Source', Collapsed);
	item.description = [snapshot.source, count(snapshot.keys, 'key')].join(' · ');
	item.tooltip = `Every key with its text in ${snapshot.source}, the source language`;
	item.iconPath = themed('book');

	return item;
}

function sourceScopeItem({ scope }) {
	const item = new vscode.TreeItem(scope.name, Collapsed);

	item.iconPath = themed('symbol-namespace');

	return item;
}

function problemLines({ problems }) {
	return problems.map(({ severity, message }) => `${SEVERITY_LOOK[severity].word}: ${message}`);
}

function sourceKeyItem({ entry, lang }, index) {
	const item = new vscode.TreeItem(entry.name, None);
	const text = String(index.translation(entry.scope, entry.ulid, lang).text ?? '').trim();
	const label = `\`${entry.scope}.${entry.name}\` · ${entry.ulid}`;
	const shown = '' === text ? '(empty)' : text;
	const [worst] = entry.problems;
	const mark = undefined === worst ? '' : `${SEVERITY_LOOK[worst.severity].symbol} `;

	item.description = `${mark}${shorten(shown, TEXT_PREVIEW)}`;
	item.tooltip = new vscode.MarkdownString(`${label}\n\n`).appendText(
		[shown, ...problemLines(entry)].join('\n\n'),
	);
	item.contextValue = 'key';

	item.command = {
		command: 'translocoUlidI18n.openKey',
		title: 'Open',
		arguments: [{ ...entry, lang }],
	};

	return item;
}

function languagesItem({ snapshot }) {
	const item = new vscode.TreeItem('Languages', Expanded);

	item.description = count(snapshot.languages.length, 'item');
	item.tooltip = `Every target language against ${snapshot.source}, the source language`;
	item.iconPath = themed('globe');

	return item;
}

function scopesItem({ snapshot }) {
	const item = new vscode.TreeItem('Scopes', Collapsed);

	item.description = count(snapshot.scopes.length, 'item');
	item.iconPath = themed('list-tree');

	return item;
}

function checksSummary(checks) {
	const totals = SEVERITIES.map((severity) => {
		const groups = checks.filter((group) => severity === group.severity);

		return [severity, groups.reduce((sum, group) => sum + group.items.length, 0)];
	}).filter(([, total]) => 0 !== total);

	return 0 === totals.length
		? 'all clear'
		: totals.map(([severity, total]) => count(total, SEVERITY_LOOK[severity].word)).join(' · ');
}

function checksItem({ snapshot }) {
	const { checks } = snapshot;
	const item = new vscode.TreeItem('Checks', 0 === checks.length ? None : Collapsed);

	item.description = checksSummary(checks);
	item.tooltip = 'What transloco-ulid check reports, besides the pending translations above';
	item.iconPath =
		0 === checks.length ? STATUS_LOOK.fresh.icon : SEVERITY_LOOK[checks[0].severity].icon;

	return item;
}

function checkItem({ group }) {
	const item = new vscode.TreeItem(group.type, Collapsed);

	item.description = String(group.items.length);
	item.tooltip = group.meaning;
	item.iconPath = SEVERITY_LOOK[group.severity].icon;
	item.contextValue = 'unused-key' === group.type ? 'checkUnused' : 'check';

	return item;
}

function findingItem({ finding }, index) {
	const item = new vscode.TreeItem(shorten(finding.message, MESSAGE_PREVIEW), None);
	const file = path.resolve(index.root, finding.file);
	const where = path.relative(index.root, file);

	item.description = Number.isInteger(finding.line) ? `${where}:${finding.line}` : where;
	item.tooltip = finding.message;
	item.command = openCommand(file, finding.line, finding.col);

	return item;
}

function aboutItem({ snapshot }, index) {
	const version = null === snapshot.cliVersion ? '' : ` ${snapshot.cliVersion}`;
	const item = new vscode.TreeItem(`CLI${version}`, None);

	item.description = path.relative(index.root, snapshot.configFile);
	item.tooltip = `@drackp2m/transloco-ulid-cli in ${index.cliDir}`;
	item.iconPath = themed('package');
	item.command = openCommand(snapshot.configFile);

	return item;
}

module.exports = {
	about: aboutItem,
	check: checkItem,
	checks: checksItem,
	finding: findingItem,
	key: keyItem,
	language: languageItem,
	languages: languagesItem,
	scope: scopeItem,
	scopes: scopesItem,
	source: sourceItem,
	sourceKey: sourceKeyItem,
	sourceScope: sourceScopeItem,
	status: statusItem,
};
