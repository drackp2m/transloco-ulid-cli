const ERROR_TYPES = new Set([
	'missing-keys-file',
	'missing-lang-file',
	'invalid-json',
	'bad-const-name',
	'invalid-ulid',
	'bad-scope-prefix',
	'duplicate-ulid',
	'missing-translation',
	'param-mismatch',
	'icu-syntax',
	'missing-other',
	'missing-plural-category',
	'unknown-plural-category',
	'unknown-gender-value',
	'unsupported-argument',
	'too-many-forms',
	'stale-params',
	'missing-params-file',
	'missing-barrel',
	'unregistered-scope',
	'unregistered-params',
]);

const INFO_TYPES = new Set(['commented-usage']);

export const FIXABLE_TYPES = new Set([
	'stale-params',
	'missing-params-file',
	'missing-translation',
	'unregistered-scope',
	'orphan-translation',
]);

export const KEYS_COLUMN = 'keys';
export const PARAMS_COLUMN = 'params';

export const severityOf = (type) => {
	if (ERROR_TYPES.has(type)) {
		return 'error';
	}

	return INFO_TYPES.has(type) ? 'info' : 'warning';
};

export const columnOf = (item) => item.lang ?? item.column ?? KEYS_COLUMN;

export const columnsOf = (langs) => [KEYS_COLUMN, PARAMS_COLUMN, ...langs];

// Infos never turn a cell yellow: they aren't problems, so a column with only
// a note (e.g. a key referenced from a comment) still reads as OK.
export function statusOf(items) {
	const relevant = items.filter(({ type }) => 'info' !== severityOf(type));

	if (relevant.some(({ type }) => 'error' === severityOf(type))) {
		return 'error';
	}

	return 0 === relevant.length ? 'ok' : 'warning';
}

export function cellsOf(scope, findings, columns) {
	const mine = findings.filter((item) => item.scope === scope.name);

	return columns.map((column) => statusOf(mine.filter((item) => columnOf(item) === column)));
}
