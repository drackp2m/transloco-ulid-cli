import { readFileSync, writeFileSync } from 'node:fs';

import { isUlid } from '../catalogue/config.mjs';
import { readState, writeState } from '../catalogue/freshness.mjs';
import { buildScopeParams } from '../catalogue/params.mjs';

const idOf = (scope, name) => `${scope}:${name}`;

const escaped = (name) => name.replace(/[$]/g, '\\$&');

// A key only a comment mentions is still somebody's: commented-out markup tends to come back.
// Only a key nothing references at all is a candidate.
export function unusedKeys({ scopes, defaultLang, usages, commented }) {
	const used = (scope, name) =>
		usages.has(idOf(scope.name, name)) || true === commented?.has(idOf(scope.name, name));

	return scopes
		.filter((scope) => scope.keys)
		.flatMap((scope) =>
			scope.keys.entries
				.filter((entry) => isUlid(entry.ulid) && !used(scope, entry.name))
				.map((entry) => ({
					scope: scope.name,
					key: entry.name,
					ulid: entry.ulid,
					source: String(scope.translations.get(defaultLang)?.data?.[entry.ulid] ?? ''),
				})),
		);
}

function keysWrite(scope, entries) {
	const lines = readFileSync(scope.keysFile, 'utf8').split('\n');
	const holds = ({ name, ulid, line }) =>
		new RegExp(`^\\s*${escaped(name)}\\s*:`).test(lines[line - 1] ?? '') &&
		lines[line - 1].includes(ulid);
	const problems = entries
		.filter((entry) => !holds(entry))
		.map(({ name, line }) => `${scope.keysFile}:${line} does not hold ${name} on a line of its own`);
	const dropped = new Set(entries.map(({ line }) => line - 1));
	const content = lines.filter((_, at) => !dropped.has(at)).join('\n');

	return { problems, writes: [{ file: scope.keysFile, content }] };
}

function translationWrites(scope, ulids, langs) {
	const problems = [];
	const writes = [];

	for (const translation of langs.map((lang) => scope.translations.get(lang))) {
		if (!translation?.exists) {
			continue;
		}

		if (null === translation.data) {
			problems.push(`${translation.file} is not valid JSON: ${translation.error}`);
			continue;
		}

		const kept = Object.entries(translation.data).filter(([ulid]) => !ulids.has(ulid));

		if (kept.length !== Object.keys(translation.data).length) {
			const content = `${JSON.stringify(Object.fromEntries(kept), null, '\t')}\n`;

			writes.push({ file: translation.file, content });
		}
	}

	return { problems, writes };
}

// Like add, params.ts is only rewritten when it was in step before, so the removed keys are
// the only change the command makes to it.
function paramsWrites(scope, pruned, defaultLang) {
	if (buildScopeParams(scope, defaultLang).stale) {
		return { writes: [], left: true };
	}

	const after = buildScopeParams(pruned, defaultLang);

	return { writes: after.stale ? [{ file: after.file, content: after.content }] : [], left: false };
}

function sealsOf(scope, pruned, { ulids, i18nDir }) {
	const state = readState(i18nDir, scope.name);

	if (state.error) {
		return { problems: [`${state.file} is not valid JSON: ${state.error}`], seals: [] };
	}

	const touched = Object.keys(state.data ?? {}).some((ulid) => ulids.has(ulid));

	return {
		problems: [],
		seals: touched ? [{ file: state.file, scope: pruned, data: state.data }] : [],
	};
}

function scopePlan(scope, entries, { langs, defaultLang, i18nDir }) {
	const ulids = new Set(entries.map(({ ulid }) => ulid));
	const names = new Set(entries.map(({ name }) => name));
	const pruned = {
		...scope,
		keys: { ...scope.keys, entries: scope.keys.entries.filter(({ name }) => !names.has(name)) },
	};
	const keys = keysWrite(scope, entries);
	const translations = translationWrites(scope, ulids, langs);
	const params = paramsWrites(scope, pruned, defaultLang);
	const state = sealsOf(scope, pruned, { ulids, i18nDir });

	return {
		problems: [...keys.problems, ...translations.problems, ...state.problems],
		writes: [...keys.writes, ...translations.writes, ...params.writes],
		seals: state.seals,
		paramsLeft: params.left ? [scope.name] : [],
	};
}

const PICKED = (keys) => (scope) => (entry) =>
	keys.some((item) => item.scope === scope.name && item.key === entry.name);

// Everything removing the keys touches, computed before anything is written: their line in
// keys.ts, their entry in every <lang>.json, their seals and their params.ts entry.
export function planPrune({ scopes, langs, defaultLang, i18nDir, keys }) {
	const picked = PICKED(keys);
	const found = scopes
		.filter((scope) => scope.keys)
		.map((scope) => ({ scope, entries: scope.keys.entries.filter(picked(scope)) }))
		.filter(({ entries }) => 0 !== entries.length);
	const plans = found.map(({ scope, entries }) =>
		scopePlan(scope, entries, { langs, defaultLang, i18nDir }),
	);

	return {
		keys: found.flatMap(({ scope, entries }) =>
			entries.map(({ name, ulid }) => ({ scope: scope.name, key: name, ulid })),
		),
		problems: plans.flatMap((plan) => plan.problems),
		writes: plans.flatMap((plan) => plan.writes),
		seals: plans.flatMap((plan) => plan.seals),
		paramsLeft: plans.flatMap((plan) => plan.paramsLeft),
		i18nDir,
		langs,
	};
}

export function applyPrune({ plan }) {
	if (0 !== plan.problems.length) {
		throw new Error(plan.problems.join('\n'));
	}

	for (const write of plan.writes) {
		writeFileSync(write.file, write.content, 'utf8');
	}

	const { i18nDir, langs } = plan;
	const seals = plan.seals.map(({ scope, data }) => writeState(scope, { i18nDir, langs, data }));

	return [...plan.writes.map((write) => write.file), ...seals.filter((file) => null !== file)];
}
