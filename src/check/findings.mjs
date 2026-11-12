const ERROR = 'error';
const WARNING = 'warning';
const INFO = 'info';

export const SEVERITIES = [ERROR, WARNING, INFO];

export const GROUPS = ['pending', 'message', 'structure', 'usage', 'context'];

const FIX = true;

const ruleIn =
	(group) =>
	(severity, meaning, fixable = false) =>
		Object.freeze({ group, severity, fixable, meaning });

const pending = ruleIn('pending');
const message = ruleIn('message');
const structure = ruleIn('structure');
const usage = ruleIn('usage');
const context = ruleIn('context');

// Everything the tool can say about a catalogue, once: what each finding is called, what it
// is about, how much it weighs, what it means and whether --fix settles it. The report, the
// summary, the README table and any editor integration read it from here.
export const RULES = Object.freeze({
	'missing-translation': pending(ERROR, 'A language has no entry for a key the source has.', FIX),
	'empty-translation': pending(
		WARNING,
		'The entry is there and empty: waiting for the translator.',
	),
	'orphan-translation': structure(WARNING, 'A language has an entry no key declares.', FIX),
	'stale-translation': pending(WARNING, 'The source changed after it was translated.'),
	'param-mismatch': message(ERROR, 'A translation adds, drops or changes a parameter.'),
	'icu-syntax': message(ERROR, 'The text is not valid ICU.'),
	'missing-other': message(ERROR, 'A plural or select has no `other` branch.'),
	'missing-plural-category': message(ERROR, 'A plural lacks a form the language needs.'),
	'unknown-plural-category': message(
		ERROR,
		'A plural branches on a form the language does not have.',
	),
	'unknown-gender-value': message(
		ERROR,
		'A gender select branches on a value the setting never holds.',
	),
	'unsupported-argument': message(ERROR, 'A `selectordinal`.'),
	'too-many-forms': message(ERROR, 'The message opens into more than 16 forms in some language.'),
	'ambiguous-hash': message(ERROR, '`#` under two or more plurals.'),
	'stray-plural-param': message(
		WARNING,
		'A plural form of the source names another parameter and never its number.',
	),
	'stale-params': structure(ERROR, '`params.ts` does not match the source texts.', FIX),
	'missing-params-file': structure(ERROR, 'A scope with parameters has no `params.ts`.', FIX),
	'unregistered-scope': structure(ERROR, 'A scope is missing from `I18n` in `index.ts`.', FIX),
	'unregistered-params': structure(ERROR, "A scope's parameters are missing from `I18nParams`."),
	'missing-barrel': structure(ERROR, 'There is no `index.ts`.'),
	'missing-keys-file': structure(ERROR, 'A scope directory has no `keys.ts`.'),
	'missing-lang-file': structure(ERROR, 'A scope has no file for a language.'),
	'invalid-json': structure(ERROR, 'A translation, state, glossary or notes file does not parse.'),
	'bad-const-name': structure(ERROR, '`keys.ts` exports a constant not named after its scope.'),
	'invalid-ulid': structure(ERROR, "A key's value is not a ULID."),
	'bad-scope-prefix': structure(ERROR, "A key's value lacks its scope prefix, or has another one."),
	'duplicate-ulid': structure(ERROR, 'Two keys share a ULID.'),
	'unused-key': usage(WARNING, 'Nothing references the key.'),
	'commented-usage': usage(INFO, 'Only a comment references the key.'),
	'missing-pipe': usage(ERROR, 'A template interpolates a key without the translating pipe.'),
	'unknown-key': usage(ERROR, 'The code refers to a key, or a scope, the catalogue does not have.'),
	'unknown-context-key': context(WARNING, 'A name in a context heading matches no key.'),
	'empty-context-section': context(WARNING, 'A context heading has no text under it.'),
	'glossary-term-missing-lang': context(
		WARNING,
		'A glossary term has no translation for a language.',
	),
	'missing-notes-file': context(ERROR, '`notesLang` names a language without its notes file.'),
	'bad-note-text': context(ERROR, 'A notes text is missing or empty, or changes a placeholder.'),
	'unknown-note-text': context(WARNING, 'The notes file has a text the template does not.'),
	'untranslated-note-text': context(
		WARNING,
		'Texts of the notes file are still the English template.',
	),
});

export const RULE_TYPES = Object.keys(RULES);

export const isRule = (type) => Object.hasOwn(RULES, type);

// A finding nobody registered would be printed as a warning and never fail anything, so it
// is refused out loud instead: a new rule starts by being written in the table above.
export function ruleOf(type) {
	if (!isRule(type)) {
		throw new Error(`"${type}" is not a registered rule`);
	}

	return RULES[type];
}

export const severityOf = (type) => ruleOf(type).severity;

export const groupOf = (type) => ruleOf(type).group;

export const isFixable = (type) => ruleOf(type).fixable;

export const FIXABLE_TYPES = new Set(RULE_TYPES.filter((type) => RULES[type].fixable));

export const typesOf = (group) => RULE_TYPES.filter((type) => group === RULES[type].group);

export const withRule = (item) => ({ ...item, ...ruleOf(item.type) });

export const KEYS_COLUMN = 'keys';
export const PARAMS_COLUMN = 'params';

export const columnOf = (item) => item.lang ?? item.column ?? KEYS_COLUMN;

export const columnsOf = (langs) => [KEYS_COLUMN, PARAMS_COLUMN, ...langs];

// Infos never turn a cell yellow: they aren't problems, so a column with only
// a note (e.g. a key referenced from a comment) still reads as OK.
export function statusOf(items) {
	const relevant = items.filter(({ type }) => INFO !== severityOf(type));

	if (relevant.some(({ type }) => ERROR === severityOf(type))) {
		return ERROR;
	}

	return 0 === relevant.length ? 'ok' : WARNING;
}

export function cellsOf(scope, findings, columns) {
	const mine = findings.filter((item) => item.scope === scope.name);

	return columns.map((column) => statusOf(mine.filter((item) => columnOf(item) === column)));
}
