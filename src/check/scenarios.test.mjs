import { deepStrictEqual } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { after, describe, test } from 'node:test';

import {
	createCatalogue,
	findingsOf,
	linesOf,
	removeCatalogues,
	ulidOf,
} from '../testing/catalogue.mjs';

const ULID = ulidOf(0);
const PLURAL = '{count, plural, one {# reto} other {# retos}}';
const ENGLISH_PLURAL = '{count, plural, one {# challenge} other {# challenges}}';
const FOUR = '{count, plural, one {# one} few {# few} many {# many} other {# other}}';
const TWO = '{count, plural, one {# one} other {# other}}';
const MIN = 'Al menos {length} caracteres.';

after(removeCatalogues);

const oneKey = (texts, extra = {}) =>
	createCatalogue({ ...extra, keys: [{ name: 'KEY', texts, ...extra.key }] });

const RU = { langs: ['ru-RU', 'en-GB'] };
const JA = { langs: ['ja-JP', 'en-GB'] };

const findings = (catalogue) => linesOf(findingsOf(catalogue));

const fieldsOf = (catalogue) =>
	readFileSync(path.join(catalogue.scopeDir, 'params.ts'), 'utf8')
		.split('\n')
		.filter((line) => line.startsWith('\t\t'))
		.map((line) => line.trim());

describe('a plural param, in the source language', () => {
	test('counts with # and is typed a number', () => {
		const catalogue = oneKey({ 'es-ES': PLURAL, 'en-GB': ENGLISH_PLURAL });

		deepStrictEqual(findings(catalogue), []);
		deepStrictEqual(fieldsOf(catalogue), ['count: number;']);
	});

	test('counts just as well written by name, and is still a number', () => {
		const source = '{count, plural, one {{count} reto} other {{count} retos}}';
		const catalogue = oneKey({ 'es-ES': source, 'en-GB': ENGLISH_PLURAL });

		deepStrictEqual(findings(catalogue), []);
		deepStrictEqual(fieldsOf(catalogue), ['count: number;']);
	});

	test('is a string when nothing branches on it', () => {
		const catalogue = oneKey({
			'es-ES': 'Tienes {count} retos',
			'en-GB': 'You have {count} challenges',
		});

		deepStrictEqual(fieldsOf(catalogue), ['count: string;']);
	});

	test('may go unused in every form', () => {
		const source = '{count, plural, one {Un reto} other {Varios retos}}';
		const target = '{count, plural, one {A challenge} other {Some}}';
		const catalogue = oneKey({ 'es-ES': source, 'en-GB': target });

		deepStrictEqual(findings(catalogue), []);
		deepStrictEqual(fieldsOf(catalogue), ['count: number;']);
	});

	test('takes a param the forms name instead of counting as one more, valid ICU', () => {
		const source = '{count, plural, one {{total} reto} other {{total} retos}}';
		const target = '{count, plural, one {{total} challenge} other {{total} challenges}}';
		const catalogue = oneKey({ 'es-ES': source, 'en-GB': target });

		deepStrictEqual(findings(catalogue), []);
		deepStrictEqual(fieldsOf(catalogue), ['count: number;', 'total: string;']);
	});
});

describe('a translation against its source', () => {
	test('may count by name where the source counts with #', () => {
		const target = '{count, plural, one {{count} challenge} other {{count} challenges}}';

		deepStrictEqual(findings(oneKey({ 'es-ES': PLURAL, 'en-GB': target })), []);
	});

	test('is an error when it turns the plural into a plain param', () => {
		deepStrictEqual(findings(oneKey({ 'es-ES': PLURAL, 'en-GB': '{count} challenges' })), [
			`error param-mismatch [en-GB]: ${ULID} writes {count} as plain, not as plural in "en-GB"`,
		]);
	});

	test('is an error when it is up to date and drops a param', () => {
		const catalogue = oneKey(
			{ 'es-ES': MIN, 'en-GB': 'At least a few characters.' },
			{ key: { seal: true } },
		);

		deepStrictEqual(findings(catalogue), [
			`error param-mismatch [en-GB]: ${ULID} drops {length} in "en-GB"`,
		]);
	});

	test('is still that error while params.ts is out of date for the key', () => {
		const params = `export interface DemoI18nParams {\n\t'demo.${ULID}': {\n\t\tlength: number;\n\t\textra: string;\n\t};\n}\n`;
		const catalogue = oneKey(
			{ 'es-ES': MIN, 'en-GB': 'At least a few characters.' },
			{ key: { seal: true }, params },
		);

		deepStrictEqual(findings(catalogue), [
			`error stale-params: DemoI18nParams declares {extra} for KEY (demo.${ULID}), absent from the default language`,
			`error param-mismatch [en-GB]: ${ULID} drops {length} in "en-GB"`,
		]);
	});

	test('is only stale when the source gained the param after it was translated', () => {
		const catalogue = oneKey(
			{ 'es-ES': MIN, 'en-GB': 'At least 8 characters.' },
			{ key: { seal: 'Al menos 8 caracteres.' } },
		);

		deepStrictEqual(findings(catalogue), [
			`warning stale-translation [en-GB]: KEY (${ULID}) was translated from an older "es-ES"`,
		]);
	});

	test('is a warning while it is empty, and an error when its entry is missing', () => {
		const catalogue = createCatalogue({
			keys: [
				{ name: 'EMPTY', texts: { 'es-ES': 'Guardar', 'en-GB': '' } },
				{ name: 'MISSING', texts: { 'es-ES': 'Borrar', 'en-GB': null } },
			],
		});

		deepStrictEqual(findings(catalogue), [
			`warning empty-translation [en-GB]: EMPTY (${ulidOf(0)})`,
			`error missing-translation [en-GB]: MISSING (${ulidOf(1)}) has no "en-GB" entry`,
		]);
	});
});

describe('a key and where it is used', () => {
	const SAVE = { 'es-ES': 'Guardar', 'en-GB': 'Save' };

	test('is a warning when nothing references it', () => {
		deepStrictEqual(findings(oneKey(SAVE, { key: { used: false } })), [
			'warning unused-key: KEY is never referenced',
		]);
	});

	test('is a note when only a comment references it', () => {
		const catalogue = oneKey(SAVE, {
			key: { used: false },
			usages: '<!-- {{ I18n.demo.KEY | i18n }} -->',
		});

		deepStrictEqual(findings(catalogue), [
			'info commented-usage: KEY is only referenced from a comment',
		]);
	});

	test('is an error when an interpolation renders it without the pipe', () => {
		const catalogue = oneKey(SAVE, {
			usages: '<p>{{ I18n.demo.KEY }}</p>\n<p>{{ (on ? I18n.demo.KEY : DemoI18n.KEY) | i18n }}</p>',
		});

		deepStrictEqual(findings(catalogue), [
			'error missing-pipe: demo.KEY is interpolated without "| i18n", so the key itself is what renders',
		]);
	});

	test('leaves a key handed to a binding or held in TypeScript alone', () => {
		const catalogue = oneKey(SAVE, {
			usages: '<app-field [label]="I18n.demo.KEY" />\n<!-- {{ I18n.demo.KEY }} -->',
		});

		deepStrictEqual(findings(catalogue), []);
	});

	test('leaves a reference to a key keys.ts does not declare to TypeScript', () => {
		const catalogue = oneKey(SAVE, { usages: '<p>{{ I18n.demo.NOT_DECLARED | i18n }}</p>' });

		deepStrictEqual(findings(catalogue), []);
	});
});

describe('the source language decides the forms', () => {
	test('a Russian source needs one, few, many and other', () => {
		const catalogue = oneKey({ 'ru-RU': TWO, 'en-GB': TWO }, RU);

		deepStrictEqual(findings(catalogue), [
			`error missing-plural-category [ru-RU]: KEY (${ULID}) {count} has no "few" branch, which "ru-RU" needs`,
			`error missing-plural-category [ru-RU]: KEY (${ULID}) {count} has no "many" branch, which "ru-RU" needs`,
		]);
	});

	test('each translation answers for its own forms, not for those of the source', () => {
		const catalogue = oneKey({ 'ru-RU': FOUR, 'en-GB': TWO }, RU);

		deepStrictEqual(findings(catalogue), []);
	});

	test('an English translation copying the Russian forms branches on ones it never has', () => {
		const catalogue = oneKey({ 'ru-RU': FOUR, 'en-GB': FOUR }, RU);

		deepStrictEqual(findings(catalogue), [
			`error unknown-plural-category [en-GB]: KEY (${ULID}) {count} branches on "few", which "en-GB" never selects`,
			`error unknown-plural-category [en-GB]: KEY (${ULID}) {count} branches on "many", which "en-GB" never selects`,
		]);
	});

	test('a Japanese source needs other alone, and has no "one" to branch on', () => {
		const alone = '{count, plural, other {# other}}';

		deepStrictEqual(findings(oneKey({ 'ja-JP': alone, 'en-GB': TWO }, JA)), []);
		deepStrictEqual(findings(oneKey({ 'ja-JP': TWO, 'en-GB': TWO }, JA)), [
			`error unknown-plural-category [ja-JP]: KEY (${ULID}) {count} branches on "one", which "ja-JP" never selects`,
		]);
	});
});

describe('a sentence that counts two things', () => {
	const ES_RU = { langs: ['es-ES', 'ru-RU'] };
	const EMPTY = `warning empty-translation [ru-RU]: KEY (${ULID})`;
	const branch = 'one {x} other {y}';

	test('passes with each number written by name, while the Russian slot is still empty', () => {
		const source =
			'{messages, plural, one {{messages, number} mensaje} ' +
			'other {{messages, number} mensajes}} de {friends, plural, ' +
			'one {{friends, number} amigo} other {{friends, number} amigos}}';

		deepStrictEqual(findings(oneKey({ 'es-ES': source, 'ru-RU': '' }, ES_RU)), [EMPTY]);
	});

	test('is refused with #, which the forms of the export cannot tell apart', () => {
		const source =
			'{messages, plural, one {# mensaje} other {# mensajes}} de ' +
			'{friends, plural, one {# amigo} other {# amigos}}';

		deepStrictEqual(findings(oneKey({ 'es-ES': source, 'ru-RU': '' }, ES_RU)), [
			EMPTY,
			`error ambiguous-hash [es-ES]: KEY (${ULID}) writes # under {messages} and {friends}, ` +
				'and once its forms are split nothing says which number each # is — ' +
				'write {messages, number} or {friends, number} instead',
		]);
	});

	test('reports the source when a language it is not written in opens too wide', () => {
		const source = `{a, plural, ${branch}} {b, plural, ${branch}} {c, plural, ${branch}}`;

		deepStrictEqual(findings(oneKey({ 'es-ES': source, 'ru-RU': '' }, ES_RU)), [
			EMPTY,
			`error too-many-forms [es-ES]: KEY (${ULID}) opens into 64 forms in "ru-RU", ` +
				'over the 16 allowed — split the sentence instead of branching it further',
		]);
	});
});
