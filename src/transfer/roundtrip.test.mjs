import { deepStrictEqual, ok, strictEqual, throws } from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { after, describe, test } from 'node:test';

import { hashOf } from '../catalogue/freshness.mjs';
import {
	XLIFF_PREFIX,
	createCatalogue,
	findingsOf,
	linesOf,
	removeCatalogues,
	scopesOf,
	ulidOf,
} from '../testing/catalogue.mjs';

import { buildExport } from './build.mjs';
import { applyImport, planImport } from './merge.mjs';
import { readXliff } from './xliff.mjs';

const LANGS = ['en-GB', 'es-ES'];
const PLACEHOLDER = '<ph id="t1" dataRef="d1"/>';
const SECOND = '<ph id="t2" dataRef="d2"/>';
const EMPTY = '<target></target>';

after(removeCatalogues);

const catalogueWith = (keys) => createCatalogue({ langs: LANGS, keys });

const optionsOf = (catalogue) => ({
	defaultLang: 'en-GB',
	langs: LANGS,
	i18nDir: catalogue.i18nDir,
	xliffPrefix: XLIFF_PREFIX,
	notesLang: 'en',
});

const exportOf = (catalogue, filter = 'all') =>
	buildExport({
		...optionsOf(catalogue),
		scopes: scopesOf(catalogue),
		lang: 'es-ES',
		filter,
		usages: new Map(),
		root: catalogue.root,
	}).content;

function fillIn(text, answers) {
	let index = 0;

	return text.replace(/<target><\/target>/g, () => `<target>${answers[index++]}</target>`);
}

function importInto(catalogue, text, accept = () => []) {
	const options = optionsOf(catalogue);
	const documents = [{ file: 'es-ES.xlf', xliff: readXliff(text) }];
	const plan = planImport({ ...options, scopes: scopesOf(catalogue), documents });
	const accepted = accept(plan);
	const written = applyImport({ ...options, plan, scopes: scopesOf(catalogue), accepted });

	return { plan, written: written.map((file) => path.relative(catalogue.root, file)) };
}

const read = (catalogue, ...parts) =>
	JSON.parse(readFileSync(path.join(catalogue.i18nDir, ...parts), 'utf8'));

const spanish = (catalogue) => read(catalogue, 'demo', 'es-ES.json');

const sealOf = (catalogue, index) => read(catalogue, 'state', 'demo.json')[ulidOf(index)]?.['es-ES'];

const messagesOf = (plan) => plan.problems.map((problem) => problem.message);

describe('export, translate, import', () => {
	test('brings every translation back, sealed, with nothing left to report', () => {
		const catalogue = catalogueWith([
			{ name: 'SAVE', texts: { 'en-GB': 'Save', 'es-ES': '' } },
			{ name: 'GREET', texts: { 'en-GB': 'Hello {name}', 'es-ES': '' } },
		]);

		importInto(catalogue, fillIn(exportOf(catalogue, 'missing'), ['Guardar', `Hola ${PLACEHOLDER}`]));

		deepStrictEqual(spanish(catalogue), { [ulidOf(0)]: 'Guardar', [ulidOf(1)]: 'Hola {name}' });
		strictEqual(sealOf(catalogue, 1), hashOf('Hello {name}'));
		deepStrictEqual(linesOf(findingsOf(catalogue)), []);
	});

	test('puts a plural back together from one unit per form', () => {
		const source = '{count, plural, one {# challenge} other {# challenges}}';
		const catalogue = catalogueWith([{ name: 'CHALLENGES', texts: { 'en-GB': source, 'es-ES': '' } }]);
		const answers = [`${PLACEHOLDER} reto`, `${PLACEHOLDER} retos`];

		importInto(catalogue, fillIn(exportOf(catalogue, 'missing'), answers));

		strictEqual(spanish(catalogue)[ulidOf(0)], '{count, plural, one {# reto} other {# retos}}');
	});

	test('puts two plurals back together, each number where the translator left it', () => {
		const source =
			'You have {messages, plural, one {{messages, number} message} ' +
			'other {{messages, number} messages}} from {friends, plural, ' +
			'one {{friends, number} friend} other {{friends, number} friends}}';
		const catalogue = catalogueWith([{ name: 'PENDING', texts: { 'en-GB': source, 'es-ES': '' } }]);
		const pairs = [
			['mensaje', 'amigo'],
			['mensaje', 'amigos'],
			['mensajes', 'amigo'],
			['mensajes', 'amigos'],
		];
		const answers = pairs.map(([m, f]) => `Tienes ${PLACEHOLDER} ${m} de ${SECOND} ${f}`);
		const form = ([m, f]) => `Tienes {messages, number} ${m} de {friends, number} ${f}`;
		const [oneOne, oneOther, otherOne, otherOther] = pairs.map(form);

		importInto(catalogue, fillIn(exportOf(catalogue, 'missing'), answers));

		strictEqual(
			spanish(catalogue)[ulidOf(0)],
			`{messages, plural, one {{friends, plural, one {${oneOne}} other {${oneOther}}}} ` +
				`other {{friends, plural, one {${otherOne}} other {${otherOther}}}}}`,
		);
		deepStrictEqual(linesOf(findingsOf(catalogue)), []);
	});

	test('reports a form of two plurals that leaves one of the numbers out', () => {
		const source =
			'{a, plural, one {{a, number} ejercicio} other {{a, number} ejercicios}} de ' +
			'{b, plural, one {{b, number} ronda} other {{b, number} rondas}}';
		const catalogue = catalogueWith([{ name: 'ROUNDS', texts: { 'en-GB': source, 'es-ES': '' } }]);
		const whole = `${PLACEHOLDER} x de ${SECOND} y`;
		const answers = [whole, whole, whole, `${PLACEHOLDER} x de y`];
		const { plan } = importInto(catalogue, fillIn(exportOf(catalogue, 'missing'), answers));

		deepStrictEqual(messagesOf(plan), ['placeholders differ from en-GB']);
	});

	test('leaves a plural untouched when one of its forms comes back empty', () => {
		const source = '{count, plural, one {# challenge} other {# challenges}}';
		const catalogue = catalogueWith([{ name: 'CHALLENGES', texts: { 'en-GB': source, 'es-ES': '' } }]);
		const { plan } = importInto(catalogue, fillIn(exportOf(catalogue, 'missing'), [`${PLACEHOLDER} reto`, '']));

		strictEqual(spanish(catalogue)[ulidOf(0)], '');
		deepStrictEqual(messagesOf(plan), ['1 of 2 forms came back empty — the key is left untouched']);
	});

	test('skips a unit that came back empty, keeping what the catalogue had', () => {
		const catalogue = catalogueWith([
			{ name: 'SAVE', texts: { 'en-GB': 'Save', 'es-ES': 'Guardar' }, seal: true },
			{ name: 'DELETE', texts: { 'en-GB': 'Delete', 'es-ES': '' } },
		]);
		const { plan, written } = importInto(catalogue, exportOf(catalogue));

		deepStrictEqual(plan.counts.get('es-ES'), { updated: 0, unchanged: 1, empty: 1 });
		deepStrictEqual(written, []);
	});

	test('reports a translation that drops a placeholder, which the check then holds as an error', () => {
		const catalogue = catalogueWith([{ name: 'GREET', texts: { 'en-GB': 'Hello {name}', 'es-ES': '' } }]);
		const { plan } = importInto(catalogue, fillIn(exportOf(catalogue, 'missing'), ['Hola']));

		deepStrictEqual(messagesOf(plan), ['placeholders differ from en-GB']);
		deepStrictEqual(linesOf(findingsOf(catalogue)), [
			`error param-mismatch [es-ES]: ${ulidOf(0)} drops {name} in "es-ES"`,
		]);
	});
});

describe('import — freshness', () => {
	const GREET = { name: 'GREET', texts: { 'en-GB': 'Hello {name}', 'es-ES': 'Hola {name}' } };

	test('keeps a stale unit stale when it comes back untouched', () => {
		const catalogue = catalogueWith([{ ...GREET, seal: 'Hi {name}' }]);
		const { plan } = importInto(catalogue, exportOf(catalogue, 'stale'));

		strictEqual(plan.outdated.length, 1);
		strictEqual(sealOf(catalogue, 0), hashOf('Hi {name}'));
	});

	test('seals a stale unit the translator moved on from its outdated state', () => {
		const catalogue = catalogueWith([{ ...GREET, seal: 'Hi {name}' }]);
		const revised = exportOf(catalogue, 'stale')
			.replace(` subState="${XLIFF_PREFIX}:outdated"`, '')
			.replace('state="initial"', 'state="translated"');

		importInto(catalogue, revised);

		strictEqual(sealOf(catalogue, 0), hashOf('Hello {name}'));
		deepStrictEqual(linesOf(findingsOf(catalogue)), []);
	});

	test('seals a unit whose source changed while it was out against that older source', () => {
		const catalogue = catalogueWith([{ name: 'GREET', texts: { 'en-GB': 'Hello {name}', 'es-ES': '' } }]);
		const translated = fillIn(exportOf(catalogue, 'missing'), [`Hola ${PLACEHOLDER}`]);
		const moved = translated.replace(/(<note category="srcHash">)[0-9a-f]+/, '$1000000000000');
		const { plan } = importInto(catalogue, moved);

		strictEqual(spanish(catalogue)[ulidOf(0)], 'Hola {name}');
		strictEqual(plan.outdated.length, 1);
		strictEqual(sealOf(catalogue, 0), '000000000000');
		deepStrictEqual(linesOf(findingsOf(catalogue)), [
			`warning stale-translation [es-ES]: GREET (${ulidOf(0)}) was translated from an older "en-GB"`,
		]);
	});
});

describe('import — keys the catalogue does not know', () => {
	const unknownIn = (catalogue) =>
		exportOf(catalogue)
			.replace(`demo.${ulidOf(0)}`, `demo.${ulidOf(900)}`)
			.replace(EMPTY, '<target>Nuevo</target>');

	test('offers one, named after the constant its note carries', () => {
		const catalogue = catalogueWith([{ name: 'SAVE', texts: { 'en-GB': 'Save', 'es-ES': '' } }]);
		const { plan } = importInto(catalogue, unknownIn(catalogue));

		deepStrictEqual(
			plan.added.map(({ name, ulid, source, target }) => ({ name, ulid, source, target })),
			[{ name: 'SAVE_2', ulid: ulidOf(900), source: 'Save', target: 'Nuevo' }],
		);
	});

	test('appends an accepted one to keys.ts, with its source and its translation', () => {
		const catalogue = catalogueWith([{ name: 'SAVE', texts: { 'en-GB': 'Save', 'es-ES': '' } }]);

		importInto(catalogue, unknownIn(catalogue), (plan) => plan.added);

		const keys = readFileSync(path.join(catalogue.scopeDir, 'keys.ts'), 'utf8');

		ok(keys.includes(`\tSAVE_2: 'demo.${ulidOf(900)}',\n} as const;`));
		strictEqual(read(catalogue, 'demo', 'en-GB.json')[ulidOf(900)], 'Save');
		strictEqual(spanish(catalogue)[ulidOf(900)], 'Nuevo');
	});

	test('refuses to add one to a keys.ts whose object does not end in "} as const;"', () => {
		const catalogue = catalogueWith([{ name: 'SAVE', texts: { 'en-GB': 'Save', 'es-ES': '' } }]);
		const keys = path.join(catalogue.scopeDir, 'keys.ts');

		writeFileSync(keys, readFileSync(keys, 'utf8').replace('} as const;', '};'));

		throws(
			() => importInto(catalogue, unknownIn(catalogue), (plan) => plan.added),
			/cannot find "\} as const;" in .*keys\.ts$/,
		);
	});

	test('writes nothing for one that was not accepted', () => {
		const catalogue = catalogueWith([{ name: 'SAVE', texts: { 'en-GB': 'Save', 'es-ES': '' } }]);
		const { written } = importInto(catalogue, unknownIn(catalogue));

		deepStrictEqual(written, []);
	});
});
