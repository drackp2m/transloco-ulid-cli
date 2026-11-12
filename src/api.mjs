import { readFileSync } from 'node:fs';

import { withRule } from './check/findings.mjs';
import { problemsIn } from './check/icu.mjs';

// What an editor integration or another tool builds on. Everything else under src/ is how
// the commands are made and moves freely between versions; what is exported here only
// changes its meaning together with API_VERSION.
export const API_VERSION = 1;

const MANIFEST = new URL('../package.json', import.meta.url);

export const CLI_VERSION = JSON.parse(readFileSync(MANIFEST, 'utf8')).version;

export { PARAMS_LEFT, planKey } from './add/plan.mjs';
export {
	formDoubt,
	formProblem,
	formsToAsk,
	keyNameProblem,
	paramNameProblem,
	pluralSource,
	textProblems,
} from './add/rules.mjs';
export { usagesIn } from './catalogue/collect.mjs';
export {
	CONFIG_FILE,
	isUlid,
	loadProject,
	readLanguages,
	toKebabCase,
	toPascalCase,
} from './catalogue/config.mjs';
export { representativeOf } from './catalogue/forms.mjs';
export { STATUSES, tallyOf } from './catalogue/freshness.mjs';
export { analyse } from './check/analysis.mjs';
export {
	GROUPS,
	RULES,
	RULE_TYPES,
	SEVERITIES,
	groupOf,
	isFixable,
	isRule,
	ruleOf,
	severityOf,
	typesOf,
} from './check/findings.mjs';
export { DEFAULT_OUT_DIR, buildExport, exportLangs, writeExport } from './transfer/build.mjs';
export { applyImport, planImport } from './transfer/merge.mjs';
export { readXliff } from './transfer/xliff.mjs';

// One text on its own, as `check` would judge it inside the catalogue: each problem with the
// rule it goes by. `source` asks what only the source language answers for.
export const checkText = (text, lang, options) => problemsIn(text, lang, options).map(withRule);
