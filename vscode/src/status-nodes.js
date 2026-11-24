const vscode = require('vscode');

const { SHOWN } = require('./status-data');

const SECTIONS = ['languages', 'scopes', 'source', 'checks', 'about'];
const OPEN_LIMIT = 20;
const { Collapsed, Expanded } = vscode.TreeItemCollapsibleState;

const CHILDREN = {
	languages: ({ snapshot }) =>
		snapshot.languages.map((language) => ({ kind: 'language', language, scope: null })),
	scopes: ({ snapshot }) => snapshot.scopes.map((scope) => ({ kind: 'scope', scope })),
	scope: ({ scope }) =>
		scope.languages.map((language) => ({ kind: 'language', language, scope: scope.name })),
	language: ({ language, scope }) =>
		SHOWN.filter((status) => 0 !== (language.keys[status]?.length ?? 0)).map((status) => ({
			kind: 'status',
			status,
			language,
			scope,
		})),
	status: ({ status, language }) => language.keys[status].map((row) => ({ kind: 'key', row })),
	source: ({ snapshot }) =>
		snapshot.scopes.map((scope) => ({ kind: 'sourceScope', scope, lang: snapshot.source })),
	sourceScope: ({ scope, lang }) =>
		scope.entries.map((entry) => ({ kind: 'sourceKey', entry, lang })),
	checks: ({ snapshot }) => snapshot.checks.map((group) => ({ kind: 'check', group })),
	check: ({ group }) => group.items.map((finding) => ({ kind: 'finding', finding })),
};

const FILLED = {
	languages: (snapshot) => 0 !== snapshot.languages.length,
	scopes: (snapshot) => 0 !== snapshot.scopes.length,
	source: (snapshot) => 0 !== snapshot.scopes.length,
	checks: (snapshot) => 0 !== snapshot.checks.length,
};

function rootNodes(snapshot) {
	if (undefined !== snapshot.error) {
		return [];
	}

	const whole = undefined === snapshot.filter && true !== snapshot.pendingOnly;
	const shown = (kind) => whole || (FILLED[kind]?.(snapshot) ?? true);

	return SECTIONS.filter(shown).map((kind) => ({ kind, snapshot }));
}

const childrenOf = (node) => CHILDREN[node.kind]?.(node) ?? [];

const SEGMENTS = {
	language: ({ language }) => language.lang,
	scope: ({ scope }) => scope.name,
	status: ({ status }) => status,
	key: ({ row }) => `${row.scope}.${row.ulid}`,
	sourceScope: ({ scope }) => scope.name,
	sourceKey: ({ entry }) => `${entry.scope}.${entry.ulid}`,
	check: ({ group }) => group.type,
	finding: (node, position) => `finding${position}`,
};

const segmentOf = (node, position) => SEGMENTS[node.kind]?.(node, position) ?? node.kind;

const LEAVES = {
	status: ({ status, language }) => language.keys[status].length,
	sourceScope: ({ scope }) => scope.entries.length,
	check: ({ group }) => group.items.length,
};

const FOLDS = {
	default: () => undefined,
	collapsed: (item) => (Expanded === item.collapsibleState ? Collapsed : undefined),
	expanded: (item, node) =>
		Collapsed === item.collapsibleState && OPEN_LIMIT >= (LEAVES[node.kind]?.(node) ?? 0)
			? Expanded
			: undefined,
};

function folded(fold, item, node) {
	item.collapsibleState = FOLDS[fold](item, node) ?? item.collapsibleState;

	return item;
}

const isSection = (node) => SECTIONS.includes(node.kind);

module.exports = { childrenOf, folded, isSection, rootNodes, segmentOf };
