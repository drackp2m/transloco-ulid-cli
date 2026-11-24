import { deepStrictEqual, ok, strictEqual, throws } from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { after, describe, test } from 'node:test';

import { collectUsages } from '../catalogue/collect.mjs';
import { createCatalogue, removeCatalogues, scopesOf, ulidOf } from '../testing/catalogue.mjs';
import { COMMENTED, IN_A_COMMENT, LANGS, SAVE, STALE } from '../testing/project.mjs';

import { applyPrune, planPrune, unusedKeys } from './plan.mjs';

after(removeCatalogues);

const UNUSED = { ...STALE, used: false };

const optionsOf = (catalogue) => ({
	scopes: scopesOf(catalogue),
	langs: LANGS,
	defaultLang: 'en-GB',
	i18nDir: catalogue.i18nDir,
});

const planOf = (catalogue, keys = [{ scope: 'demo', key: 'GREET' }]) =>
	planPrune({ ...optionsOf(catalogue), keys });

describe('unusedKeys', () => {
	test('returns the keys nothing references, with their source text, and not a commented one', () => {
		const catalogue = createCatalogue({ langs: LANGS, keys: [SAVE, UNUSED, COMMENTED], usages: IN_A_COMMENT });
		const sources = collectUsages([catalogue.sourceDir], { pipe: 'i18n' });

		deepStrictEqual(unusedKeys({ ...optionsOf(catalogue), ...sources }), [
			{ scope: 'demo', key: 'GREET', ulid: ulidOf(1), source: 'Hello {name}' },
		]);
	});
});

describe('planPrune', () => {
	test('plans keys.ts, every language, params.ts and the seals before writing any of them', () => {
		const catalogue = createCatalogue({ langs: LANGS, keys: [SAVE, UNUSED] });
		const plan = planOf(catalogue);
		const files = plan.writes.map(({ file }) => path.basename(file));

		deepStrictEqual(plan.keys, [{ scope: 'demo', key: 'GREET', ulid: ulidOf(1) }]);
		deepStrictEqual(files, ['keys.ts', 'en-GB.json', 'es-ES.json', 'params.ts']);
		strictEqual(plan.seals.length, 1);
		deepStrictEqual(plan.problems, []);
	});

	test('leaves a params.ts that was already out of step, and says so', () => {
		const catalogue = createCatalogue({ langs: LANGS, keys: [SAVE, UNUSED], params: 'export interface Stale {}\n' });
		const plan = planOf(catalogue);

		deepStrictEqual(plan.paramsLeft, ['demo']);
		ok(!plan.writes.some(({ file }) => file.endsWith('params.ts')));
	});

	test('refuses a translation file that does not parse, and applyPrune writes nothing then', () => {
		const catalogue = createCatalogue({ langs: LANGS, keys: [SAVE, UNUSED] });

		writeFileSync(path.join(catalogue.scopeDir, 'es-ES.json'), '{ broken');

		const plan = planOf(catalogue);

		ok(plan.problems.some((problem) => problem.includes('es-ES.json is not valid JSON')));
		throws(() => applyPrune({ plan }), /es-ES\.json is not valid JSON/);
	});

	test('plans nothing for a key it is not asked about', () => {
		const catalogue = createCatalogue({ langs: LANGS, keys: [SAVE, UNUSED] });

		deepStrictEqual(planOf(catalogue, []).writes, []);
	});
});
