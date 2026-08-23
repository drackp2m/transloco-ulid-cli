#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { c, plural } from '../lint/lint-report.mjs';

import { readScopes } from './catalogue/collect.mjs';
import { DEFAULTS, listOf, readLanguages, valueOf } from './catalogue/config.mjs';
import { readState, writeState } from './catalogue/freshness.mjs';

function parseClearArgs(argv) {
	const languageFile = valueOf(argv, '--languages');

	return {
		...DEFAULTS,
		...(valueOf(argv, '--dir') ? { i18nDir: valueOf(argv, '--dir') } : {}),
		...(languageFile ? { languageFile, ...readLanguages(languageFile) } : {}),
		requested: listOf(argv, '--lang') ?? [],
		only: listOf(argv, '--scope') ?? [],
		unseal: argv.includes('--unseal'),
		dryRun: argv.includes('--dry-run'),
	};
}

function fail(message) {
	console.error(`  ${c.red}✖ ${message}${c.reset}`);
	process.exit(1);
}

function targetLangs({ requested, langs, defaultLang }) {
	if (0 === requested.length) {
		fail('nothing to clear — name the languages with --lang <code>[,<code>]');
	}

	const unknown = requested.filter((lang) => !langs.includes(lang));

	if (0 !== unknown.length) {
		fail(`unknown language(s): ${unknown.join(', ')}`);
	}

	if (requested.includes(defaultLang)) {
		fail(`${defaultLang} is the source language — clearing it would empty the catalogue`);
	}

	return requested;
}

function targetScopes(scopes, only) {
	const owned = scopes.filter((scope) => scope.keys);
	const unknown = only.filter((name) => !owned.some((scope) => scope.name === name));

	if (0 !== unknown.length) {
		fail(`unknown scope(s): ${unknown.join(', ')}`);
	}

	return 0 === only.length ? owned : owned.filter((scope) => only.includes(scope.name));
}

// The value goes back to "" instead of the key being dropped: a ULID missing
// from a <lang>.json is a missing-translation error that "pnpm i18n:check --fix"
// puts back as an empty string anyway, so this writes the shape the catalogue
// settles on — and leaves a diff of values alone.
function clearedIn(translation) {
	const entries = Object.entries(translation.data);
	const filled = entries.filter(([, value]) => '' !== String(value).trim());

	if (0 === filled.length) {
		return null;
	}

	const data = Object.fromEntries(entries.map(([ulid]) => [ulid, '']));

	return { filled: filled.length, content: `${JSON.stringify(data, null, '\t')}\n` };
}

function planFor(scopes, langs) {
	const plans = [];

	for (const scope of scopes) {
		for (const lang of langs) {
			const translation = scope.translations.get(lang);
			const cleared =
				translation?.exists && null === translation.error ? clearedIn(translation) : null;

			if (null !== cleared) {
				plans.push({ scope, lang, file: translation.file, ...cleared });
			}
		}
	}

	return plans;
}

// Only under --unseal: an empty target already reads as "missing" before any
// hash is consulted, so a leftover seal changes nothing — dropping it just keeps
// state/ from vouching for a translation that is no longer there.
function unsealed(data, langs) {
	return Object.fromEntries(
		Object.entries(data).map(([ulid, hashes]) => [
			ulid,
			Object.fromEntries(Object.entries(hashes).filter(([lang]) => !langs.has(lang))),
		]),
	);
}

function clearSeals(plans, options) {
	const byScope = new Map();

	for (const plan of plans) {
		byScope.set(plan.scope, new Set([...(byScope.get(plan.scope) ?? []), plan.lang]));
	}

	return [...byScope]
		.map(([scope, langs]) => {
			const state = readState(options.i18nDir, scope.name);

			return state.error
				? null
				: writeState(scope, { ...options, data: unsealed(state.data, langs) });
		})
		.filter((file) => null !== file);
}

function applyClear(plans, options) {
	for (const plan of plans) {
		writeFileSync(plan.file, plan.content, 'utf8');
	}

	const seals = options.unseal ? clearSeals(plans, options) : [];

	return [...plans.map((plan) => plan.file), ...seals];
}

function printPlans(plans) {
	const width = Math.max(...plans.map((plan) => plan.lang.length));

	for (const plan of plans) {
		const lang = `${c.cyan}${plan.lang.padEnd(width)}${c.reset}`;

		console.log(`  ${lang}  ${plan.scope.name} ${c.dim}·${c.reset} ${plan.filled} cleared`);
	}
}

function printWritten(written) {
	console.log(`\n  ${c.dim}Files written:${c.reset}`);

	for (const file of written) {
		console.log(`      ${path.resolve(file)}`);
	}

	console.log(`\n  ${c.green}✔ ${plural(written.length, 'file')} updated${c.reset}`);
}

const options = parseClearArgs(process.argv.slice(2));
const langs = targetLangs(options);
const scopes = readScopes(options);

if (0 === scopes.length) {
	fail(`no scopes in ${options.i18nDir}`);
}

const targeted = targetScopes(scopes, options.only);
const plans = planFor(targeted, langs);
const total = plans.reduce((count, plan) => count + plan.filled, 0);
const details = `${plural(langs.length, 'language')} · ${plural(targeted.length, 'scope')}`;
const action = options.dryRun ? 'Translations that would be cleared' : 'Clearing translations';

console.log(`${c.bold}${action}...${c.reset} ${c.dim}(${details})${c.reset}\n`);

if (0 === plans.length) {
	console.log(`  ${c.dim}✓ Nothing to clear — every target is already empty${c.reset}`);
	process.exit(0);
}

printPlans(plans);

if (options.dryRun) {
	console.log(`\n  ${c.dim}${plural(total, 'translation')} — drop --dry-run to write.${c.reset}`);
	process.exit(0);
}

printWritten(applyClear(plans, options));

const hint = `${c.dim} — send them out again with "pnpm i18n:export --missing".${c.reset}`;

console.log(`\n  ${c.yellow}⚠ ${plural(total, 'translation')} cleared${c.reset}${hint}`);
