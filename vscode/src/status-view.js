const vscode = require('vscode');

const { buildStatus } = require('./status-data');
const { filterStatus, messageOf, pendingStatus } = require('./status-filter');
const items = require('./status-items');
const { childrenOf, folded, isSection, rootNodes, segmentOf } = require('./status-nodes');
const { locate } = require('./util');

const VIEW = 'translocoUlidI18n.status';
const FILTERING = 'translocoUlidI18n.filtering';
const OPENED = 'translocoUlidI18n.opened';
const PENDING_ONLY = 'translocoUlidI18n.pendingOnly';
const FAILED = 'translocoUlidI18n.failed';
const HAS_UNUSED = 'translocoUlidI18n.hasUnused';
const { Expanded } = vscode.TreeItemCollapsibleState;

const setContext = (key, value) => void vscode.commands.executeCommand('setContext', key, value);

class StatusView {
	constructor(index) {
		this.index = index;
		this.snapshot = null;
		this.view = null;
		this.filter = '';
		this.pendingOnly = false;
		this.fold = 'default';
		this.generation = 0;
		this.seen = new Set();
		this.open = new Set();
		this.opened = null;
		this.changed = new vscode.EventEmitter();
		this.onDidChangeTreeData = this.changed.event;
	}

	dispose() {
		this.changed.dispose();
	}

	attach(view) {
		this.view = view;
		view.onDidExpandElement(({ element }) => this.toggled(element, true));
		view.onDidCollapseElement(({ element }) => this.toggled(element, false));

		return view;
	}

	refresh() {
		this.snapshot = null;
		this.changed.fire(undefined);
	}

	setFold(fold) {
		this.fold = fold;
		this.regenerate();
		this.changed.fire(undefined);
	}

	setFilter(value) {
		const filter = value.trim();

		if (filter !== this.filter) {
			this.filter = filter;
			this.fold = '' === filter ? 'default' : 'expanded';
			this.regenerate();
			this.snapshot = null;
			setContext(FILTERING, '' !== filter);
			this.changed.fire(undefined);
		}

		return this.current().filter;
	}

	setPendingOnly(pendingOnly) {
		this.pendingOnly = pendingOnly;
		this.regenerate();
		this.snapshot = null;
		setContext(PENDING_ONLY, pendingOnly);
		this.changed.fire(undefined);
	}

	regenerate() {
		this.generation += 1;
		this.seen.clear();
		this.open.clear();
	}

	current() {
		if (null === this.snapshot) {
			this.snapshot = this.build();
			setContext(FAILED, undefined !== this.snapshot.error);
			setContext(HAS_UNUSED, 0 !== (this.snapshot.unused ?? 0));

			if (null !== this.view) {
				this.view.message = messageOf(this.snapshot);
			}
		}

		return this.snapshot;
	}

	build() {
		if (null !== this.index.error || null === this.index.api) {
			return { error: this.index.error ?? 'The translation index is not loaded yet' };
		}

		try {
			const whole = buildStatus(this.index);
			const snapshot = '' === this.filter ? whole : filterStatus(whole, this.index, this.filter);

			return this.pendingOnly ? pendingStatus(snapshot) : snapshot;
		} catch (error) {
			return { error: error instanceof Error ? error.message : String(error) };
		}
	}

	getChildren(node) {
		const children = undefined === node ? rootNodes(this.current()) : childrenOf(node);
		const parent = node?.path ?? `g${this.generation}`;
		const placed = children.map((child, position) => ({
			...child,
			path: `${parent}/${segmentOf(child, position)}`,
		}));

		if (undefined === node) {
			this.prune(new Set(placed.map(({ path }) => path)));
		}

		return placed;
	}

	getTreeItem(node) {
		const item = folded(this.fold, items[node.kind](node, this.index), node);

		item.id = node.path;

		if (isSection(node) && !this.seen.has(node.path)) {
			this.seen.add(node.path);
			this.toggled(node, Expanded === item.collapsibleState);
		}

		return item;
	}

	prune(paths) {
		for (const tracked of [this.seen, this.open]) {
			[...tracked].filter((path) => !paths.has(path)).forEach((path) => tracked.delete(path));
		}

		this.publishOpened();
	}

	toggled(node, expanded) {
		if (isSection(node)) {
			this.open[expanded ? 'add' : 'delete'](node.path);
			this.publishOpened();
		}
	}

	publishOpened() {
		const opened = 0 !== this.open.size;

		if (opened !== this.opened) {
			this.opened = opened;
			setContext(OPENED, opened);
		}
	}
}

async function openKey(index, row) {
	const target = index.translation(row.scope, row.ulid, row.lang);
	const source = index.translation(row.scope, row.ulid, index.defaultLang);
	const location = locate(null === target.text ? source.file : target.file, `"${row.ulid}"`);

	if (null !== location) {
		await vscode.window.showTextDocument(location.uri, { selection: location.range });
	}
}

module.exports = { STATUS_VIEW: VIEW, StatusView, openKey };
