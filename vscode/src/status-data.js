const STATUSES = ['missing', 'stale', 'unknown', 'fresh'];
const UNUSED = 'unused';
const SHOWN = [...STATUSES, UNUSED];
const PENDING = ['missing', 'stale'];
const SEVERITIES = ['error', 'warning', 'info'];

const emptyKeys = () => Object.fromEntries(SHOWN.map((status) => [status, []]));

const percentOf = (part, total) => (0 === total ? 0 : Math.floor((part * 100) / total));

function progressOf(keys) {
	const total = STATUSES.reduce((sum, status) => sum + keys[status].length, 0);

	return { total, fresh: keys.fresh.length, translated: total - keys.missing.length };
}

const pendingOf = (keys) => PENDING.reduce((sum, status) => sum + keys[status].length, 0);

const mergedKeys = (languages) =>
	Object.fromEntries(
		SHOWN.map((status) => [status, languages.flatMap((language) => language.keys[status] ?? [])]),
	);

const unusedOf = (findings) =>
	new Set(
		findings
			.filter(({ type, ulid }) => 'unused-key' === type && null !== ulid)
			.map(({ scope, ulid }) => `${scope}.${ulid}`),
	);

function languagesOf(targets, rows, unused) {
	const byLang = new Map(targets.map((lang) => [lang, { lang, keys: emptyKeys() }]));

	for (const row of rows) {
		const status = unused.has(`${row.scope}.${row.ulid}`) ? UNUSED : row.status;

		byLang.get(row.lang)?.keys[status]?.push(row);
	}

	return [...byLang.values()];
}

const rank = ({ severity }) => SEVERITIES.indexOf(severity);

const aboutSource = (index) => (finding) =>
	null !== finding.ulid &&
	(finding.lang === index.defaultLang || (null === finding.lang && 'pending' !== finding.group));

function sourceProblems(index) {
	const byKey = new Map();

	for (const finding of index.analysis.findings.filter(aboutSource(index))) {
		const id = `${finding.scope}.${finding.ulid}`;

		byKey.set(id, [...(byKey.get(id) ?? []), finding]);
	}

	for (const findings of byKey.values()) {
		findings.sort((left, right) => rank(left) - rank(right));
	}

	return byKey;
}

function scopeOf(scope, { index, targets, problems, unused }) {
	const rows = index.analysis.freshness.filter((row) => row.scope === scope.name);
	const entries = scope.keys.entries
		.filter((entry) => index.api.isUlid(entry.ulid))
		.map(({ name, ulid }) => ({
			scope: scope.name,
			name,
			ulid,
			problems: problems.get(`${scope.name}.${ulid}`) ?? [],
		}));

	return {
		name: scope.name,
		keys: entries.length,
		entries,
		rows,
		languages: languagesOf(targets, rows, unused),
		unused: entries.filter((entry) => unused.has(`${scope.name}.${entry.ulid}`)).length,
	};
}

const ruleOf = ({ severity, meaning }) => ({ severity, meaning });

function checksOf(items) {
	const byType = new Map();

	for (const item of items.filter((entry) => 'pending' !== entry.group)) {
		byType.set(item.type, [...(byType.get(item.type) ?? []), item]);
	}

	return [...byType]
		.map(([type, items]) => ({ type, ...ruleOf(items[0]), items }))
		.sort((left, right) => rank(left) - rank(right) || right.items.length - left.items.length);
}

function buildStatus(index) {
	const targets = index.langs.filter((lang) => lang !== index.defaultLang);
	const problems = sourceProblems(index);
	const unused = unusedOf(index.analysis.findings);
	const scopes = index.rawScopes
		.filter((scope) => scope.keys)
		.map((scope) => scopeOf(scope, { index, targets, problems, unused }));

	return {
		source: index.defaultLang,
		keys: scopes.reduce((sum, scope) => sum + scope.keys, 0),
		unused: scopes.reduce((sum, scope) => sum + scope.unused, 0),
		languages: languagesOf(targets, index.analysis.freshness, unused),
		scopes,
		checks: checksOf(index.analysis.findings),
		cliVersion: index.api.CLI_VERSION,
		configFile: index.configFile,
	};
}

module.exports = {
	PENDING,
	SHOWN,
	STATUSES,
	UNUSED,
	SEVERITIES,
	buildStatus,
	mergedKeys,
	pendingOf,
	percentOf,
	progressOf,
};
