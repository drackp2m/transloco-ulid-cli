import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { isUlid } from './config.mjs';
import { fileExists, readText } from './files.mjs';

export const STATE_DIR = 'state';

export const STATUSES = ['fresh', 'stale', 'missing', 'unknown'];

export const hashOf = (text) =>
	createHash('sha256')
		.update(String(text ?? ''), 'utf8')
		.digest('hex')
		.slice(0, 12);

export const stateFile = (i18nDir, scopeName) => path.join(i18nDir, STATE_DIR, `${scopeName}.json`);

export function readState(i18nDir, scopeName) {
	const file = stateFile(i18nDir, scopeName);

	if (!fileExists(file)) {
		return { file, exists: false, error: null, data: {}, text: null };
	}

	const text = readText(file);

	try {
		return { file, exists: true, error: null, data: JSON.parse(text), text };
	} catch (error) {
		return { file, exists: true, error: error.message, data: {}, text };
	}
}

export const readStates = (i18nDir, scopes) =>
	new Map(scopes.map((scope) => [scope.name, readState(i18nDir, scope.name)]));

export function statusOf(state, ulid, lang, source, target) {
	if ('' === String(target ?? '').trim()) {
		return 'missing';
	}

	const hash = state.data[ulid]?.[lang];

	if (undefined === hash) {
		return 'unknown';
	}

	return hash === hashOf(source) ? 'fresh' : 'stale';
}

const declaredOf = (scope) => (scope.keys?.entries ?? []).filter((entry) => isUlid(entry.ulid));

export function freshnessOf(scope, state, { langs, defaultLang }) {
	const source = scope.translations.get(defaultLang)?.data ?? {};
	const targets = langs.filter((lang) => lang !== defaultLang);
	const entries = [];

	for (const entry of declaredOf(scope)) {
		for (const lang of targets) {
			const target = scope.translations.get(lang)?.data?.[entry.ulid];
			const status = statusOf(state, entry.ulid, lang, source[entry.ulid] ?? '', target);

			entries.push({ ulid: entry.ulid, name: entry.name, lang, status });
		}
	}

	return entries;
}

const emptyTally = () => Object.fromEntries(STATUSES.map((status) => [status, 0]));

// How many translations of each target language are in each state, source language aside.
export function tallyOf(entries, { langs, defaultLang }) {
	const counts = new Map(
		langs.filter((lang) => lang !== defaultLang).map((lang) => [lang, emptyTally()]),
	);

	for (const { lang, status } of entries) {
		counts.get(lang)[status] += 1;
	}

	return counts;
}

// One entry per key and target language, across every scope that has keys, each naming the
// scope it belongs to.
export function freshnessIn(scopes, states, options) {
	return scopes
		.filter((scope) => scope.keys)
		.flatMap((scope) =>
			freshnessOf(scope, states.get(scope.name), options).map((entry) => ({
				scope: scope.name,
				...entry,
			})),
		);
}

export function sealed(data, seals) {
	const next = Object.fromEntries(
		Object.entries(data).map(([ulid, hashes]) => [ulid, { ...hashes }]),
	);

	for (const { ulid, lang, hash } of seals) {
		next[ulid] = { ...next[ulid], [lang]: hash };
	}

	return next;
}

function orderedData(scope, data, langs) {
	const byLang = (left, right) => langs.indexOf(left[0]) - langs.indexOf(right[0]);
	const result = {};

	for (const entry of declaredOf(scope)) {
		const hashes = Object.entries(data[entry.ulid] ?? {}).filter(([lang]) => langs.includes(lang));

		if (0 !== hashes.length) {
			result[entry.ulid] = Object.fromEntries(hashes.sort(byLang));
		}
	}

	return result;
}

export function writeState(scope, { i18nDir, langs, data }) {
	const current = readState(i18nDir, scope.name);
	const next = orderedData(scope, data, langs);
	const content = `${JSON.stringify(next, null, '\t')}\n`;

	if (content === current.text || (!current.exists && 0 === Object.keys(next).length)) {
		return null;
	}

	mkdirSync(path.dirname(current.file), { recursive: true });
	writeFileSync(current.file, content, 'utf8');

	return current.file;
}
