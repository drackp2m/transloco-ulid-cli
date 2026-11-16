#!/usr/bin/env node
import path from 'node:path';

import { readScopes } from './catalogue/collect.mjs';
import { listOf, readDefaults, readLanguages, valueOf } from './catalogue/config.mjs';
import { STATUSES, freshnessIn, readState, tallyOf } from './catalogue/freshness.mjs';
import { applySeal, planSeal } from './check/seal.mjs';
import { c, plural } from './shared/terminal.mjs';

const COLORS = { fresh: c.green, stale: c.yellow, missing: c.red, unknown: c.dim };

function targetsOf(argv) {
	const given = valueOf(argv, '--adopt');

	return null === given || given.startsWith('--') ? [] : given.split(',').filter(Boolean);
}

function parseStateArgs(argv) {
	const languageFile = valueOf(argv, '--languages');
	const langs = listOf(argv, '--langs');
	const declared = {
		...readDefaults(),
		...(valueOf(argv, '--dir') ? { i18nDir: valueOf(argv, '--dir') } : {}),
		...(languageFile ? { languageFile, ...readLanguages(languageFile) } : {}),
	};

	return {
		...declared,
		...(langs?.length ? { langs, defaultLang: langs[0] } : {}),
		sealedLangs: [...new Set([...(declared.langs ?? []), ...(langs ?? [])])],
		adopt: argv.includes('--adopt'),
		targets: targetsOf(argv),
	};
}

const tally = (scopes, states, options) => tallyOf(freshnessIn(scopes, states, options), options);

const cellOf = (counts, status) => `${COLORS[status]}${counts[status]} ${status}${c.reset}`;

function printTally(counts) {
	const width = Math.max(...[...counts.keys()].map((lang) => lang.length));

	for (const [lang, statuses] of counts) {
		const cells = STATUSES.filter((status) => 'unknown' !== status || 0 !== statuses[status])
			.map((status) => cellOf(statuses, status))
			.join(` ${c.dim}·${c.reset} `);

		console.log(`  ${c.cyan}${lang.padEnd(width)}${c.reset}  ${cells}`);
	}
}

function fail(lines) {
	for (const line of lines) {
		console.error(`  ${c.red}✖ ${line}${c.reset}`);
	}

	process.exit(1);
}

const staleIn = (counts) => [...counts.values()].reduce((sum, statuses) => sum + statuses.stale, 0);

function printRefused(refused) {
	if (0 === refused.length) {
		return;
	}

	console.log(`\n  ${c.yellow}⚠ ${plural(refused.length, 'translation')} not sealed:${c.reset}`);

	for (const { scope, name, lang, reasons } of refused) {
		console.log(`      ${scope}.${name} [${lang}]: ${reasons.join('; ')}`);
	}
}

function printWritten(written) {
	if (0 === written.length) {
		console.log(`\n  ${c.dim}✓ Nothing to write${c.reset}`);

		return;
	}

	console.log(`\n  ${c.dim}Files written:${c.reset}`);

	for (const file of written) {
		console.log(`      ${path.resolve(file)}`);
	}

	console.log(`\n  ${c.green}✔ ${plural(written.length, 'file')} updated${c.reset}`);
}

const options = parseStateArgs(process.argv.slice(2));
const scopes = readScopes(options);

if (0 === scopes.length) {
	fail([`no scopes in ${options.i18nDir}`]);
}

const statesOf = () =>
	new Map(scopes.map((scope) => [scope.name, readState(options.i18nDir, scope.name)]));
const before = statesOf();
const broken = [...before.values()].filter((state) => null !== state.error);

if (0 !== broken.length) {
	fail(broken.map((state) => `${state.file}: ${state.error}`));
}

const details = `${plural(scopes.length, 'scope')} · ${plural(options.langs.length, 'language')}`;
const action = options.adopt ? 'Adopting i18n state...' : 'i18n freshness...';

console.log(`${c.bold}${action}${c.reset} ${c.dim}(${details})${c.reset}\n`);

if (!options.adopt) {
	printTally(tally(scopes, before, options));
	console.log(`\n  ${c.dim}Seal today's sources with "transloco-ulid state --adopt".${c.reset}`);
	process.exit(0);
}

const plan = planSeal({ ...options, scopes }, options.targets);

if (0 !== plan.unknown.length) {
	fail(plan.unknown.map(({ target, problem }) => `${target} ${problem}`));
}

// --langs narrows what is counted and sealed, never what is kept: the state file is written
// with every language of the catalogue, or the seals of the ones left out would be dropped.
const written = applySeal({ ...options, scopes, langs: options.sealedLangs }, plan);
const after = tally(scopes, statesOf(), options);
const cleared = staleIn(tally(scopes, before, options)) - staleIn(after);

printTally(after);

if (0 !== cleared) {
	const message = `${plural(cleared, 'outdated translation')} sealed as fresh`;

	console.log(`\n  ${c.yellow}⚠ ${message}${c.reset}`);
}

printRefused(plan.refused);
printWritten(written);

if (0 !== plan.refused.length && 0 !== options.targets.length) {
	process.exitCode = 1;
}
