import { readFileSync } from 'node:fs';
import path from 'node:path';

import { readBarrel } from '../catalogue/collect.mjs';
import { AMBIENT_PARAMS } from '../catalogue/config.mjs';
import { paramNamesOf } from '../catalogue/message.mjs';
import { buildScopeParams, paramsName } from '../catalogue/params.mjs';
import { newUlid } from '../catalogue/ulid.mjs';

import { keyNameProblem, strayMessage, strayParamsIn, textProblems } from './rules.mjs';

const KEYS_END = '} as const;';

export const PARAMS_LEFT =
	'params.ts already had pending changes, so it was left untouched: run "transloco-ulid check --fix"';

const keyValueOf = (scope, ulid) => (scope.prefixed ? `${scope.name}.${ulid}` : ulid);

const i18nDirOf = (scope) => (scope.prefixed ? path.dirname(scope.dir) : scope.dir);

const unregistered = (scope) => !readBarrel(i18nDirOf(scope)).params.has(paramsName(scope.name));

function translationProblems(scope, langs) {
	return langs.flatMap((lang) => {
		const translation = scope.translations.get(lang);

		if (!translation?.exists) {
			return [`${translation?.file ?? `${lang}.json`} does not exist`];
		}

		return null === translation.data
			? [`${translation.file} is not valid JSON: ${translation.error}`]
			: [];
	});
}

function problemsOf({ scope, name, text, langs, defaultLang }) {
	if (null === scope.keys) {
		return [`${scope.keysFile} does not exist`];
	}

	return [
		keyNameProblem(scope, name),
		...textProblems(text, defaultLang, langs),
		...translationProblems(scope, langs),
	].filter((problem) => null !== problem);
}

function keysWrite(scope, name, ulid) {
	const text = readFileSync(scope.keysFile, 'utf8');
	const end = text.lastIndexOf(KEYS_END);

	if (-1 === end) {
		return null;
	}

	const line = `\t${name}: '${keyValueOf(scope, ulid)}',\n`;

	return { file: scope.keysFile, content: `${text.slice(0, end)}${line}${text.slice(end)}` };
}

function translationWrite(translation, ulid, value) {
	const data = { ...translation.data, [ulid]: value };

	return { file: translation.file, content: `${JSON.stringify(data, null, '\t')}\n` };
}

function withKey(scope, { name, ulid, text, defaultLang }) {
	const origin = scope.translations.get(defaultLang);
	const entry = { name, value: keyValueOf(scope, ulid), ulid };

	return {
		...scope,
		keys: { ...scope.keys, entries: [...scope.keys.entries, entry] },
		translations: new Map([
			...scope.translations,
			[defaultLang, { ...origin, data: { ...origin.data, [ulid]: text } }],
		]),
	};
}

function paramsPlan(scope, key) {
	const before = buildScopeParams(scope, key.defaultLang);
	const after = buildScopeParams(withKey(scope, key), key.defaultLang);

	if (after.content === before.content) {
		return { write: null, left: false, register: false };
	}

	if (before.stale) {
		return { write: null, left: true, register: false };
	}

	const write = { file: after.file, content: after.content };

	return { write, left: false, register: !before.exists && unregistered(scope) };
}

function warningsOf(scope, text, params) {
	const register = `params.ts is new: add ${paramsName(scope.name)} to the I18nParams union of index.ts`;

	return [
		...strayParamsIn(text).map((item) => `"${item.key}": ${strayMessage(item)}`),
		...(params.left ? [PARAMS_LEFT] : []),
		...(params.register ? [register] : []),
	];
}

const refused = (ulid, problems) => ({
	ulid,
	problems,
	writes: [],
	warnings: [],
	params: [],
	paramsLeft: false,
});

// What whoever renders the key has to hand over: every param of the text but the ones the
// application fills in by itself.
const paramsToPass = (text) => paramNamesOf(text).filter((name) => !AMBIENT_PARAMS.has(name));

export function planKey(options) {
	const { scope, name, text, langs, defaultLang, ulid = newUlid() } = options;
	const problems = problemsOf(options);

	if (0 !== problems.length) {
		return refused(ulid, problems);
	}

	const keys = keysWrite(scope, name, ulid);

	if (null === keys) {
		return refused(ulid, [`${scope.keysFile} has no "${KEYS_END}" to add the key before`]);
	}

	const params = paramsPlan(scope, { name, ulid, text, defaultLang });
	const translations = langs.map((lang) =>
		translationWrite(scope.translations.get(lang), ulid, lang === defaultLang ? text : ''),
	);

	return {
		ulid,
		problems: [],
		writes: [keys, ...translations, ...(null === params.write ? [] : [params.write])],
		warnings: warningsOf(scope, text, params),
		params: paramsToPass(text),
		paramsLeft: params.left,
	};
}
