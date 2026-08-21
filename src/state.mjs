#!/usr/bin/env node
import path from 'node:path';

import { c, plural } from '../lint/lint-report.mjs';

import { readScopes } from './catalogue/collect.mjs';
import { DEFAULTS, listOf, readLanguages, valueOf } from './catalogue/config.mjs';
import {
	STATUSES,
	freshnessOf,
	hashOf,
	readState,
	sealed,
	writeState,
} from './catalogue/freshness.mjs';

const COLORS = { fresh: c.green, stale: c.yellow, missing: c.red, unknown: c.dim };

function parseStateArgs(argv) {
	const languageFile = valueOf(argv, '--languages');
	const langs = listOf(argv, '--langs');

	return {
		...DEFAULTS,
		...(valueOf(argv, '--dir') ? { i18nDir: valueOf(argv, '--dir') } : {}),
		...(languageFile ? { languageFile, ...readLanguages(languageFile) } : {}),
		...(langs?.length ? { langs, defaultLang: langs[0] } : {}),
		adopt: argv.includes('--adopt'),
	};
}

function tally(scopes, states, options) {
	const counts = new Map(
		options.langs
			.filter((lang) => lang !== options.defaultLang)
			.map((lang) => [lang, Object.fromEntries(STATUSES.map((status) => [status, 0]))]),
	);

	for (const scope of scopes.filter((entry) => entry.keys)) {
		for (const { lang, status } of freshnessOf(scope, states.get(scope.name), options)) {
			counts.get(lang)[status] += 1;
		}
	}

	return counts;
}

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

function sealsFor(scope, options) {
	const source = scope.translations.get(options.defaultLang)?.data ?? {};

	return options.langs
		.filter((lang) => lang !== options.defaultLang)
		.flatMap((lang) =>
			Object.entries(scope.translations.get(lang)?.data ?? {})
				.filter(([ulid, value]) => ulid in source && '' !== String(value).trim())
				.map(([ulid]) => ({ ulid, lang, hash: hashOf(source[ulid]) })),
		);
}

function adopt(scopes, states, options) {
	const written = [];

	for (const scope of scopes.filter((entry) => entry.keys)) {
		const data = sealed(states.get(scope.name).data, sealsFor(scope, options));
		const file = writeState(scope, { ...options, data });

		if (null !== file) {
			written.push(file);
		}
	}

	return written;
}

const options = parseStateArgs(process.argv.slice(2));
const scopes = readScopes(options);

if (0 === scopes.length) {
	console.error(`  ${c.red}✖ no scopes in ${options.i18nDir}${c.reset}`);
	process.exit(1);
}

const before = new Map(scopes.map((scope) => [scope.name, readState(options.i18nDir, scope.name)]));
const broken = [...before.values()].filter((state) => null !== state.error);

if (0 !== broken.length) {
	for (const state of broken) {
		console.error(`  ${c.red}✖ ${state.file}: ${state.error}${c.reset}`);
	}

	process.exit(1);
}

const details = `${plural(scopes.length, 'scope')} · ${plural(options.langs.length, 'language')}`;
const action = options.adopt ? 'Adopting i18n state...' : 'i18n freshness...';

console.log(`${c.bold}${action}${c.reset} ${c.dim}(${details})${c.reset}\n`);

if (!options.adopt) {
	printTally(tally(scopes, before, options));
	console.log(`\n  ${c.dim}Seal today's sources with "pnpm i18n:state --adopt".${c.reset}`);
	process.exit(0);
}

const cleared = [...tally(scopes, before, options).values()].reduce(
	(total, statuses) => total + statuses.stale,
	0,
);
const written = adopt(scopes, before, options);
const after = new Map(scopes.map((scope) => [scope.name, readState(options.i18nDir, scope.name)]));

printTally(tally(scopes, after, options));

if (0 !== cleared) {
	const message = `${plural(cleared, 'outdated translation')} sealed as fresh`;

	console.log(`\n  ${c.yellow}⚠ ${message}${c.reset}`);
}

if (0 === written.length) {
	console.log(`\n  ${c.dim}✓ Nothing to write${c.reset}`);
	process.exit(0);
}

console.log(`\n  ${c.dim}Files written:${c.reset}`);

for (const file of written) {
	console.log(`      ${path.resolve(file)}`);
}

console.log(`\n  ${c.green}✔ ${plural(written.length, 'file')} updated${c.reset}`);
