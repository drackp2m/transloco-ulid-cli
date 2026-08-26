import { c, plural } from '../lint/lint-report.mjs';

import { collectUsages, readScopes } from './catalogue/collect.mjs';
import { parseArgs } from './catalogue/config.mjs';
import { applyFix } from './check/fix.mjs';
import { writeI18nSummary, writeSkippedSummary } from './check/github-summary.mjs';
import { printFindings, printWritten } from './check/report.mjs';
import { buildFindings } from './check/rules.mjs';
import { printUsage } from './check/usage.mjs';

const argv = process.argv.slice(2);

if (argv.includes('--help') || argv.includes('-h')) {
	printUsage();
	process.exit(0);
}

const options = parseArgs(argv);
const scopes = readScopes(options);

if (!scopes.length) {
	console.log(`  ${c.dim}⊘ skipped — no scopes in ${options.i18nDir}${c.reset}`);
	writeSkippedSummary(options.i18nDir);
	process.exit(0);
}

const action = options.fix ? 'Fixing' : 'Checking';
const details = `${plural(scopes.length, 'scope')} · ${plural(options.langs.length, 'language')}`;

console.log(`${c.bold}${action} i18n...${c.reset} ${c.dim}(${details})${c.reset}`);

if (options.fix) {
	printWritten(applyFix({ ...options, scopes }));
}

// Re-read after writing: --fix reports whatever it could not fix by itself (an
// unregistered scope, a missing translation) instead of always claiming success.
const current = options.fix ? readScopes(options) : scopes;
const { usages, commented } = collectUsages(options.sourceDirs);
const findings = buildFindings({ ...options, scopes: current, usages, commented });

const exitCode = printFindings(findings, { ...options, scopes: current });

writeI18nSummary({ ...options, scopes: current, findings });

process.exit(exitCode);
