import { isUlid } from '../catalogue/config.mjs';
import { hashOf, readState, sealed, writeState } from '../catalogue/freshness.mjs';

import { severityOf } from './findings.mjs';
import { problemsIn } from './icu.mjs';
import { comparePair } from './rules.mjs';

const isBlank = (value) => '' === String(value ?? '').trim();

const targetLangs = ({ langs, defaultLang }) => langs.filter((lang) => lang !== defaultLang);

const declaredOf = (scope) => (scope.keys?.entries ?? []).filter((entry) => isUlid(entry.ulid));

// `scope`, `scope.KEY`, `scope.KEY.lang` or `scope.lang`, the key by its name or its ULID.
// A second part that is one of the languages is read as the language: no key is named so.
export function parseTarget(text, langs) {
	const [scope, second, third, ...rest] = String(text).trim().split('.');

	if ('' === scope || 0 !== rest.length || '' === second || '' === third) {
		return null;
	}

	if (undefined === second) {
		return { scope };
	}

	if (undefined === third && langs.includes(second)) {
		return { scope, lang: second };
	}

	return { scope, key: second, ...(undefined === third ? {} : { lang: third }) };
}

const wordOf = ({ scope, key, lang }) => [scope, key, lang].filter(Boolean).join('.');

function resolve(given, options) {
	const target = 'string' === typeof given ? parseTarget(given, options.langs) : given;
	const text = 'string' === typeof given ? given : wordOf(given);

	if (null === target) {
		return { text, problem: 'is not scope, scope.KEY, scope.KEY.lang or scope.lang' };
	}

	const scope = options.scopes.find((entry) => entry.keys && entry.name === target.scope);
	const named = ({ name, ulid }) => undefined === target.key || [name, ulid].includes(target.key);
	const entries = undefined === scope ? [] : declaredOf(scope).filter(named);

	if (undefined === scope) {
		return { text, problem: `names a scope the catalogue does not have: ${target.scope}` };
	}

	if (0 === entries.length) {
		return { text, problem: `names a key ${scope.name} does not have: ${target.key}` };
	}

	if (undefined !== target.lang && !targetLangs(options).includes(target.lang)) {
		return { text, problem: `names ${target.lang}, which is not a target language` };
	}

	const langs = targetLangs(options).filter((lang) => [undefined, lang].includes(target.lang));

	return { text, scope, entries, langs, explicit: undefined !== target.key };
}

const everything = (options) =>
	options.scopes
		.filter((scope) => scope.keys)
		.map((scope) => ({ scope, entries: declaredOf(scope), langs: targetLangs(options) }));

// What would make the translation an error the moment it is sealed. A stale translation is
// forgiven the parameters it has not caught up with yet; sealing it ends that, so here it
// is judged as a fresh one.
function problemsOf(scope, entry, lang, { langs, defaultLang }) {
	const source = scope.translations.get(defaultLang).data[entry.ulid];
	const value = scope.translations.get(lang).data[entry.ulid];
	const label = `${scope.name}.${entry.name}`;
	const broken = problemsIn(value, lang, { langs, source: false })
		.filter(({ type }) => 'error' === severityOf(type))
		.map(({ message }) => `${label} ${message}`);

	return [...comparePair(source, value, label, false), ...broken];
}

function judge({ scope, entry, lang, explicit }, options) {
	const source = scope.translations.get(options.defaultLang)?.data ?? {};
	const value = scope.translations.get(lang)?.data?.[entry.ulid];
	const where = { scope: scope.name, name: entry.name, ulid: entry.ulid, lang };

	if (!(entry.ulid in source) || isBlank(value)) {
		return explicit ? { refused: { ...where, reasons: ['has no translation to seal'] } } : {};
	}

	const reasons = problemsOf(scope, entry, lang, options);

	return 0 === reasons.length
		? { seal: { ...where, hash: hashOf(source[entry.ulid]) } }
		: { refused: { ...where, reasons } };
}

function candidatesOf(resolved) {
	const byPlace = new Map();

	for (const { scope, entries, langs, explicit = false } of resolved) {
		for (const entry of entries) {
			for (const lang of langs) {
				const place = `${scope.name}.${entry.ulid}.${lang}`;
				const named = explicit || true === byPlace.get(place)?.explicit;

				byPlace.set(place, { scope, entry, lang, explicit: named });
			}
		}
	}

	return [...byPlace.values()];
}

// Which translations a seal would cover, without writing anything. No target means the
// whole catalogue. `unknown` are targets that name nothing, `refused` translations that
// cannot be given for good: an empty one that was asked for by its key, or one whose
// message or parameters `check` would report as an error once it stops being stale.
export function planSeal(options, targets = []) {
	const resolved =
		0 === targets.length ? everything(options) : targets.map((target) => resolve(target, options));
	const unknown = resolved.filter(({ problem }) => undefined !== problem);
	const verdicts = candidatesOf(resolved.filter(({ problem }) => undefined === problem)).map(
		(candidate) => judge(candidate, options),
	);

	return {
		seals: verdicts.flatMap(({ seal }) => seal ?? []),
		refused: verdicts.flatMap(({ refused }) => refused ?? []),
		unknown: unknown.map(({ text, problem }) => ({ target: text, problem })),
	};
}

function statesOf(scopes, i18nDir) {
	const states = new Map(scopes.map((scope) => [scope.name, readState(i18nDir, scope.name)]));
	const broken = [...states.values()].find((state) => null !== state.error);

	if (undefined !== broken) {
		throw new Error(`${broken.file}: ${broken.error}`);
	}

	return states;
}

// Writes the seals of a plan into `state/`, and returns the files it changed. A state file
// that does not parse stops it before anything is written.
export function applySeal({ scopes, i18nDir, langs }, { seals }) {
	const names = new Set(seals.map(({ scope }) => scope));
	const touched = scopes.filter((scope) => scope.keys && names.has(scope.name));
	const states = statesOf(touched, i18nDir);

	return touched.flatMap((scope) => {
		const mine = seals.filter((seal) => seal.scope === scope.name);
		const data = sealed(states.get(scope.name).data, mine);

		return writeState(scope, { i18nDir, langs, data }) ?? [];
	});
}
