import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { after, describe, test } from 'node:test';

import {
	createCatalogue,
	findingsOf,
	linesOf,
	removeCatalogues,
	scopeOf,
	ulidOf,
} from '../testing/catalogue.mjs';

import { PARAMS_LEFT, planKey } from './plan.mjs';

const ULID = '01KZJ895M8N6WQ02RVEABRE999';
const PLURAL = '{count, plural, one {# reto} other {# retos}}';
const SAVE = { name: 'SAVE', texts: { 'es-ES': 'Guardar', 'en-GB': 'Save' } };
const GREET = { name: 'GREET', texts: { 'es-ES': 'Hola {name}', 'en-GB': 'Hello {name}' } };
const REGISTER = 'params.ts is new: add DemoI18nParams to the I18nParams union of index.ts';

after(removeCatalogues);

const planIn = (catalogue, name, text) =>
	planKey({
		scope: scopeOf(catalogue),
		name,
		text,
		langs: catalogue.langs,
		defaultLang: catalogue.defaultLang,
		ulid: ULID,
	});

function apply(plan) {
	for (const write of plan.writes) {
		writeFileSync(write.file, write.content, 'utf8');
	}

	return plan;
}

const fileOf = (catalogue, name) => path.join(catalogue.scopeDir, name);

const read = (catalogue, name) => readFileSync(fileOf(catalogue, name), 'utf8');

const dataOf = (catalogue, lang) => JSON.parse(read(catalogue, `${lang}.json`));

const fieldsOf = (catalogue) =>
	read(catalogue, 'params.ts')
		.split('\n')
		.filter((line) => line.startsWith('\t\t'))
		.map((line) => line.trim());

describe('planKey — what it writes', () => {
	test('adds the constant before "} as const;", prefixed with its scope', () => {
		const catalogue = createCatalogue({ keys: [SAVE] });

		apply(planIn(catalogue, 'CHALLENGES', PLURAL));

		ok(read(catalogue, 'keys.ts').endsWith(`\tCHALLENGES: 'demo.${ULID}',\n} as const;\n`));
	});

	test('keeps the bare ULID in the root scope', () => {
		const catalogue = createCatalogue({ scopeName: 'common', keys: [SAVE] });

		apply(planIn(catalogue, 'CHALLENGES', PLURAL));

		ok(read(catalogue, 'keys.ts').includes(`\tCHALLENGES: '${ULID}',\n`));
	});

	test('writes the text in the source language and an empty slot in every other one', () => {
		const catalogue = createCatalogue({ keys: [SAVE] });

		apply(planIn(catalogue, 'CHALLENGES', PLURAL));

		strictEqual(dataOf(catalogue, 'es-ES')[ULID], PLURAL);
		strictEqual(dataOf(catalogue, 'en-GB')[ULID], '');
	});

	test('touches nothing until the plan is applied', () => {
		const catalogue = createCatalogue({ keys: [SAVE] });
		const before = read(catalogue, 'keys.ts');

		planIn(catalogue, 'CHALLENGES', PLURAL);

		strictEqual(read(catalogue, 'keys.ts'), before);
	});

	test('leaves the empty slot and the missing usage as the only findings, both warnings', () => {
		const catalogue = createCatalogue({ keys: [GREET] });

		apply(planIn(catalogue, 'CHALLENGES', PLURAL));

		deepStrictEqual(linesOf(findingsOf(catalogue)), [
			`warning empty-translation [en-GB]: CHALLENGES (${ULID})`,
			'warning unused-key: CHALLENGES is never referenced',
		]);
	});
});

describe('planKey — params.ts', () => {
	test('says which params whoever renders the key has to pass, gender aside', () => {
		const catalogue = createCatalogue({ keys: [GREET] });
		const gendered =
			'{gender, select, male {Bienvenido {name}} other {Te damos la bienvenida {name}}}';

		deepStrictEqual(planIn(catalogue, 'CHALLENGES', PLURAL).params, ['count']);
		deepStrictEqual(planIn(catalogue, 'WELCOME', gendered).params, ['name']);
		deepStrictEqual(planIn(catalogue, 'DELETE', 'Borrar').params, []);
		deepStrictEqual(planIn(catalogue, 'GREET', 'Hola {name}').params, []);
	});

	test('brings params.ts up to date with the new key alone', () => {
		const catalogue = createCatalogue({ keys: [GREET] });
		const plan = apply(planIn(catalogue, 'CHALLENGES', PLURAL));

		deepStrictEqual(fieldsOf(catalogue), ['name: string;', 'count: number;']);
		deepStrictEqual(plan.warnings, []);
	});

	test('types the plural param as a number whether it counts with # or by name', () => {
		const catalogue = createCatalogue({ keys: [GREET] });

		const byName = '{count, plural, one {{count} reto} other {{count} retos}}';

		apply(planIn(catalogue, 'CHALLENGES', byName));

		deepStrictEqual(fieldsOf(catalogue), ['name: string;', 'count: number;']);
	});

	test('takes a param the forms name instead of counting as one more, and warns', () => {
		const catalogue = createCatalogue({ keys: [GREET] });
		const text = '{count, plural, one {{total} reto} other {{total} retos}}';
		const plan = apply(planIn(catalogue, 'CHALLENGES', text));

		deepStrictEqual(fieldsOf(catalogue), ['name: string;', 'count: number;', 'total: string;']);
		deepStrictEqual(plan.warnings, [
			'"one": {total} is not the plural param {count}: write # for the number',
			'"other": {total} is not the plural param {count}: write # for the number',
		]);
	});

	test('leaves a params.ts that already had pending changes untouched, and says so', () => {
		const stale = `export interface DemoI18nParams {\n\t'demo.${ulidOf(0)}': {\n\t\tname: string;\n\t\textra: string;\n\t};\n}\n`;
		const catalogue = createCatalogue({ keys: [GREET], params: stale });
		const plan = apply(planIn(catalogue, 'CHALLENGES', PLURAL));

		strictEqual(read(catalogue, 'params.ts'), stale);
		strictEqual(plan.paramsLeft, true);
		deepStrictEqual(plan.warnings, [PARAMS_LEFT]);
	});

	test('says nothing about a stale params.ts the new key has no params for', () => {
		const stale = `export interface DemoI18nParams {\n\t'demo.${ulidOf(0)}': {\n\t\tname: string;\n\t\textra: string;\n\t};\n}\n`;
		const catalogue = createCatalogue({ keys: [GREET], params: stale });
		const plan = planIn(catalogue, 'DELETE', 'Borrar');

		strictEqual(plan.paramsLeft, false);
		deepStrictEqual(plan.warnings, []);
	});

	test('writes no params.ts for a key without params in a scope that has none', () => {
		const catalogue = createCatalogue({ keys: [SAVE] });
		const plan = apply(planIn(catalogue, 'DELETE', 'Borrar'));

		strictEqual(plan.writes.length, 3);
		strictEqual(existsSync(fileOf(catalogue, 'params.ts')), false);
	});

	test('creates params.ts for the first key with params, quietly when the barrel lists it', () => {
		const catalogue = createCatalogue({ keys: [SAVE] });
		const plan = apply(planIn(catalogue, 'GREET', 'Hola {name}'));

		deepStrictEqual(fieldsOf(catalogue), ['name: string;']);
		deepStrictEqual(plan.warnings, []);
	});

	test('asks for the new params.ts in the barrel when it is not there', () => {
		const catalogue = createCatalogue({ keys: [SAVE] });
		const barrel = path.join(catalogue.i18nDir, 'index.ts');
		const unlisted = readFileSync(barrel, 'utf8').replace(
			/I18nParams = .*;/,
			'I18nParams = Record<never, never>;',
		);

		writeFileSync(barrel, unlisted);

		deepStrictEqual(planIn(catalogue, 'GREET', 'Hola {name}').warnings, [REGISTER]);
	});
});

describe('planKey — refusals', () => {
	test('refuses a name the scope already has, and writes nothing', () => {
		const plan = planIn(createCatalogue({ keys: [SAVE] }), 'SAVE', 'Guardar');

		deepStrictEqual(plan.problems, ['demo.SAVE already exists']);
		deepStrictEqual(plan.writes, []);
	});

	test('refuses a text that is not valid ICU', () => {
		const plan = planIn(createCatalogue({ keys: [SAVE] }), 'GREET', 'Hola {name');

		deepStrictEqual(plan.problems, ['The text is not valid ICU: Unexpected message end']);
	});

	test('refuses a Russian source that brings only the forms Spanish needs', () => {
		const catalogue = createCatalogue({
			langs: ['ru-RU', 'en-GB'],
			keys: [{ name: 'SAVE', texts: { 'ru-RU': 'Save', 'en-GB': 'Save' } }],
		});

		deepStrictEqual(planIn(catalogue, 'CHALLENGES', PLURAL).problems, [
			'{count} has no "few" branch, which "ru-RU" needs',
			'{count} has no "many" branch, which "ru-RU" needs',
		]);
	});

	test('refuses a source that opens too wide in another language of the catalogue', () => {
		const catalogue = createCatalogue({
			langs: ['es-ES', 'ru-RU'],
			keys: [{ name: 'SAVE', texts: { 'es-ES': 'Guardar', 'ru-RU': 'Сохранить' } }],
		});
		const branch = 'one {x} other {y}';
		const text = `{a, plural, ${branch}} {b, plural, ${branch}} {c, plural, ${branch}}`;
		const plan = planIn(catalogue, 'WIDE', text);

		deepStrictEqual(plan.problems, [
			'opens into 64 forms in "ru-RU", over the 16 allowed — ' +
				'split the sentence instead of branching it further',
		]);
		deepStrictEqual(plan.writes, []);
	});

	test('refuses # under two plurals, and names the way to write it', () => {
		const text =
			'{messages, plural, one {# mensaje} other {# mensajes}} de ' +
			'{friends, plural, one {# amigo} other {# amigos}}';

		deepStrictEqual(planIn(createCatalogue({ keys: [SAVE] }), 'PENDING', text).problems, [
			'writes # under {messages} and {friends}, and once its forms are split nothing says ' +
				'which number each # is — write {messages, number} or {friends, number} instead',
		]);
	});

	test('refuses to write into a language file that does not parse', () => {
		const catalogue = createCatalogue({ keys: [SAVE] });
		const file = fileOf(catalogue, 'en-GB.json');

		writeFileSync(file, '{ "broken": ');

		const [problem] = planIn(catalogue, 'DELETE', 'Borrar').problems;

		ok(problem.startsWith(`${file} is not valid JSON`));
	});

	test('refuses to write into a language file that is not there', () => {
		const catalogue = createCatalogue({ keys: [SAVE] });
		const file = fileOf(catalogue, 'en-GB.json');

		rmSync(file);

		deepStrictEqual(planIn(catalogue, 'DELETE', 'Borrar').problems, [`${file} does not exist`]);
	});

	test('refuses a scope without keys.ts', () => {
		const catalogue = createCatalogue({ keys: [SAVE] });

		rmSync(fileOf(catalogue, 'keys.ts'));

		deepStrictEqual(planIn(catalogue, 'DELETE', 'Borrar').problems, [
			`${fileOf(catalogue, 'keys.ts')} does not exist`,
		]);
	});

	test('refuses a keys.ts whose object does not end in "} as const;"', () => {
		const catalogue = createCatalogue({ keys: [SAVE] });
		const file = fileOf(catalogue, 'keys.ts');

		writeFileSync(file, read(catalogue, 'keys.ts').replace('} as const;', '};'));

		const plan = planIn(catalogue, 'DELETE', 'Borrar');

		deepStrictEqual(plan.problems, [`${file} has no "} as const;" to add the key before`]);
		deepStrictEqual(plan.writes, []);
	});
});
