const vscode = require('vscode');

const { folded, matchOf, recordsOf } = require('./search');
const { PENDING, SHOWN, mergedKeys, pendingOf, progressOf } = require('./status-data');
const { count } = require('./util');

const DEBOUNCE = 150;

const keyOf = (scope, ulid) => `${scope}.${ulid}`;

function matchesOf(index, query) {
	const matching = recordsOf(index).filter(
		(record) => index.api.isUlid(record.ulid) && null !== matchOf(record, query),
	);
	const counts = new Map();

	for (const { scope } of matching) {
		counts.set(scope, (counts.get(scope) ?? 0) + 1);
	}

	return { wanted: new Set(matching.map(({ scope, ulid }) => keyOf(scope, ulid))), counts };
}

function keepKeys(keys, wanted) {
	const kept = (rows) => rows.filter((row) => wanted.has(keyOf(row.scope, row.ulid)));

	return Object.fromEntries(SHOWN.map((status) => [status, kept(keys[status] ?? [])]));
}

function keepLanguages(languages, wanted) {
	return languages
		.map((language) => ({
			...language,
			pending: pendingOf(language.keys),
			keys: keepKeys(language.keys, wanted),
		}))
		.filter((language) => SHOWN.some((status) => 0 !== language.keys[status].length));
}

function keepScopes(scopes, { wanted, counts }) {
	return scopes
		.map((scope) => ({
			...scope,
			keys: counts.get(scope.name) ?? 0,
			entries: scope.entries.filter((entry) => wanted.has(keyOf(entry.scope, entry.ulid))),
			rows: scope.rows.filter((row) => wanted.has(keyOf(row.scope, row.ulid))),
			languages: keepLanguages(scope.languages, wanted),
		}))
		.filter((scope) => 0 !== scope.keys);
}

function keepChecks(checks, { wanted, query }) {
	const kept = (finding) =>
		wanted.has(keyOf(finding.scope, finding.ulid)) || folded(finding.message).includes(query);

	return checks
		.map((group) => ({ ...group, items: group.items.filter(kept) }))
		.filter((group) => 0 !== group.items.length);
}

function filterStatus(snapshot, index, value) {
	const query = folded(value).trim();
	const matches = matchesOf(index, query);
	const scopes = keepScopes(snapshot.scopes, matches);
	const checks = keepChecks(snapshot.checks, { ...matches, query });
	const keys = scopes.reduce((sum, scope) => sum + scope.keys, 0);
	const findings = checks.reduce((sum, group) => sum + group.items.length, 0);

	return {
		...snapshot,
		keys,
		languages: keepLanguages(snapshot.languages, matches.wanted),
		scopes,
		checks,
		filter: { value, keys, findings },
	};
}

function pendingKeys(keys) {
	return Object.fromEntries(
		SHOWN.map((status) => [status, PENDING.includes(status) ? keys[status] : []]),
	);
}

function pendingLanguages(languages) {
	return languages
		.map((language) => ({
			...language,
			progress: progressOf(language.keys),
			keys: pendingKeys(language.keys),
		}))
		.filter((language) => 0 !== pendingOf(language.keys));
}

function pendingScope(scope) {
	const languages = pendingLanguages(scope.languages);
	const rows = Object.values(mergedKeys(languages)).flat();
	const wanted = new Set(rows.map(({ ulid }) => ulid));
	const entries = scope.entries.filter((entry) => wanted.has(entry.ulid));

	return {
		...scope,
		progress: progressOf(mergedKeys(scope.languages)),
		keys: entries.length,
		entries,
		languages,
	};
}

function pendingStatus(snapshot) {
	const scopes = snapshot.scopes.map(pendingScope).filter((scope) => 0 !== scope.keys);

	return {
		...snapshot,
		keys: scopes.reduce((sum, scope) => sum + scope.keys, 0),
		languages: pendingLanguages(snapshot.languages),
		scopes,
		pendingOnly: true,
	};
}

function summaryOf(filter) {
	if (undefined === filter) {
		return undefined;
	}

	const parts = [count(filter.keys, 'key'), count(filter.findings, 'finding')];

	return 0 === filter.keys + filter.findings
		? 'nothing matches'
		: parts.filter((part) => !part.startsWith('0 ')).join(' · ');
}

function messageOf({ error, filter, pendingOnly }) {
	if (undefined !== error) {
		return error;
	}

	const parts = [
		...(undefined === filter ? [] : [`“${filter.value}” · ${summaryOf(filter)}`]),
		...(true === pendingOnly ? ['only untranslated and outdated'] : []),
	];

	return 0 === parts.length ? undefined : parts.join(' · ');
}

function askFilter(status) {
	const box = vscode.window.createInputBox();
	let timer;

	box.title = 'Filter keys and checks';
	box.placeholder = 'Key name, ULID, text in any language or check message';
	box.value = status.filter;
	box.valueSelection = [0, status.filter.length];
	box.prompt = summaryOf(status.current().filter);
	box.onDidChangeValue((value) => {
		clearTimeout(timer);
		timer = setTimeout(() => {
			box.prompt = summaryOf(status.setFilter(value));
		}, DEBOUNCE);
	});
	box.onDidAccept(() => box.hide());

	return new Promise((resolve) => {
		box.onDidHide(() => {
			clearTimeout(timer);
			status.setFilter(box.value);
			box.dispose();
			resolve();
		});
		box.show();
	});
}

module.exports = { askFilter, filterStatus, messageOf, pendingStatus };
