import { deepStrictEqual, strictEqual } from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, describe, test } from 'node:test';

import {
	collectUsages,
	parseTranslation,
	readBarrel,
	readScopes,
	usagesIn as usagesInText,
} from './collect.mjs';

const ULID = '01KZJ895M8N6WQ02RVEABRE000';
const DIRS = [];

after(() => {
	for (const dir of DIRS) {
		rmSync(dir, { recursive: true, force: true });
	}
});

function project(files) {
	const root = mkdtempSync(path.join(tmpdir(), 'i18n-collect-'));

	DIRS.push(root);

	for (const [file, content] of Object.entries(files)) {
		mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
		writeFileSync(path.join(root, file), content, 'utf8');
	}

	return root;
}

function usagesIn(root, dirs = ['src']) {
	const { usages, commented } = collectUsages(dirs.map((dir) => path.join(root, dir)));
	const relative = (found) =>
		Object.fromEntries(
			[...found].map(([id, files]) => [id, files.map((file) => path.relative(root, file))]),
		);

	return { usages: relative(usages), commented: relative(commented) };
}

describe('parseTranslation', () => {
	test('reads a catalogue file from its text, as it would from disk', () => {
		const text = '{\n\t"01J9ZQ4W7K2M6X8Y0B3C5D7E9F": "Guardar"\n}\n';

		deepStrictEqual(parseTranslation(text), {
			exists: true,
			data: { '01J9ZQ4W7K2M6X8Y0B3C5D7E9F': 'Guardar' },
			error: null,
			text,
		});
	});

	test('reports a half-typed file as an error instead of throwing', () => {
		const result = parseTranslation('{\n\t"01J9ZQ4W7K2M6X8Y0B3C5D7E9F": "Guar');

		strictEqual(result.data, null);
		strictEqual('string', typeof result.error);
	});
});

describe('collectUsages', () => {
	test('finds a key through its constant and through the barrel, in .ts and .html', () => {
		const root = project({
			'src/page.ts': 'const save = DemoI18n.SAVE;\nconst logIn = I18n.authFlow.LOG_IN;\n',
			'src/page.html': '<p>{{ I18n.demo.OPEN | i18n }}</p>\n',
		});

		deepStrictEqual(usagesIn(root).usages, {
			'demo:OPEN': ['src/page.html'],
			'demo:SAVE': ['src/page.ts'],
			'auth-flow:LOG_IN': ['src/page.ts'],
		});
	});

	test('keeps a key that only a comment mentions apart from the ones in use', () => {
		const root = project({
			'src/page.ts': 'const save = DemoI18n.SAVE;\n// DemoI18n.LOAD\n/* I18n.demo.DROP */\n',
			'src/page.html': '<!-- {{ I18n.demo.CLOSE | i18n }} -->\n',
		});

		deepStrictEqual(usagesIn(root), {
			usages: { 'demo:SAVE': ['src/page.ts'] },
			commented: {
				'demo:CLOSE': ['src/page.html'],
				'demo:LOAD': ['src/page.ts'],
				'demo:DROP': ['src/page.ts'],
			},
		});
	});

	test('walks every directory but node_modules, and reads only .ts and .html', () => {
		const root = project({
			'src/app/deep/page.ts': 'DemoI18n.SAVE;\n',
			'src/node_modules/library/index.ts': 'DemoI18n.VENDOR;\n',
			'src/notes.md': 'DemoI18n.README\n',
		});

		deepStrictEqual(usagesIn(root).usages, { 'demo:SAVE': ['src/app/deep/page.ts'] });
	});

	test('skips a source directory that is not there', () => {
		const root = project({ 'src/page.ts': 'DemoI18n.SAVE;\n' });

		deepStrictEqual(usagesIn(root, ['nowhere', 'src']).usages, { 'demo:SAVE': ['src/page.ts'] });
	});
});

describe('collectUsages — interpolations without the pipe', () => {
	const bareIn = (files, pipe) => {
		const root = project(files);

		return collectUsages([path.join(root, 'src')], { pipe }).bare.map(({ file, ...usage }) => ({
			file: path.relative(root, file),
			...usage,
		}));
	};

	test('finds a key an interpolation renders as it is, with its line and column', () => {
		const html = '<p>{{ I18n.demo.SAVE | i18n }}</p>\n<p>\n  {{ DemoI18n.LOAD }} {{ I18n.authFlow.LOG_IN | uppercase }}\n</p>\n';

		deepStrictEqual(bareIn({ 'src/page.html': html }, 'i18n'), [
			{ file: 'src/page.html', scope: 'demo', key: 'LOAD', line: 3, col: 6 },
			{ file: 'src/page.html', scope: 'auth-flow', key: 'LOG_IN', line: 3, col: 26 },
		]);
	});

	test('takes a pipe further along the interpolation, with its arguments, as the one that translates', () => {
		const html = [
			'{{ (on ? I18n.demo.SAVE : I18n.demo.LOAD) | i18n }}',
			'{{ I18n.demo.COUNT | i18n: { count: total } }}',
			'{{\n  I18n.demo.WRAPPED\n  | i18n\n}}',
			'',
		].join('\n');

		deepStrictEqual(bareIn({ 'src/page.html': html }, 'i18n'), []);
	});

	test('leaves bindings, comments and TypeScript out', () => {
		const files = {
			'src/page.html': '<app-field [label]="I18n.demo.SAVE" />\n<!-- {{ I18n.demo.LOAD }} -->\n',
			'src/page.ts': "const title = `{{ ${I18n.demo.TITLE} }}`;\n",
		};

		deepStrictEqual(bareIn(files, 'i18n'), []);
	});

	test('goes by the name of the pipe, so another pipe counts as none', () => {
		const html = '{{ I18n.demo.SAVE | transloco }}\n{{ I18n.demo.LOAD | i18nText }}\n';

		deepStrictEqual(bareIn({ 'src/page.html': html }, 'transloco').map(({ key }) => key), ['LOAD']);
	});

	test('looks for none when no pipe is given', () => {
		const root = project({ 'src/page.html': '{{ I18n.demo.SAVE }}\n' });

		deepStrictEqual(collectUsages([path.join(root, 'src')]).bare, []);
	});
});

describe('collectUsages — where each reference is written', () => {
	const sitesIn = (files) => {
		const root = project(files);

		return collectUsages([path.join(root, 'src')]).sites.map(({ file, ...site }) => ({
			file: path.relative(root, file),
			...site,
		}));
	};

	test('lists every reference in the code, with its line, its column and how long it is', () => {
		const files = {
			'src/page.ts': 'const save = DemoI18n.SAVE;\n// DemoI18n.LOAD\nI18n.authFlow.LOG_IN;\n',
		};
		const at = (line, col, length) => ({ file: 'src/page.ts', line, col, length });

		deepStrictEqual(sitesIn(files), [
			{ ...at(1, 14, 13), scope: 'demo', key: 'SAVE', barrel: false },
			{ ...at(3, 1, 20), scope: 'auth-flow', key: 'LOG_IN', barrel: true },
		]);
	});

	test('counts the lines of a comment that spans several', () => {
		const root = project({ 'src/page.html': '<!-- a\nb\nc -->\n{{ I18n.demo.SAVE }}\n' });
		const { bare, sites } = collectUsages([path.join(root, 'src')], { pipe: 'i18n' });

		deepStrictEqual(
			bare.map(({ line, col }) => ({ line, col })),
			[{ line: 4, col: 4 }],
		);
		deepStrictEqual(
			sites.map(({ line, col }) => ({ line, col })),
			[{ line: 4, col: 4 }],
		);
	});
});

describe('usagesIn — the references one text holds', () => {
	const HTML = '<!-- {{ I18n.demo.A }} -->\n{{ I18n.demo.B }} {{ DemoI18n.C | i18n }}\n';

	test('lists them in the order they are written, with where each one starts and ends', () => {
		const found = usagesInText(HTML, 'page.html', { pipe: 'i18n' });

		deepStrictEqual(
			found.map(({ key, start, end, line, col }) => ({ key, start, end, line, col })),
			[
				{ key: 'A', start: 8, end: 19, line: 1, col: 9 },
				{ key: 'B', start: 30, end: 41, line: 2, col: 4 },
				{ key: 'C', start: 48, end: 58, line: 2, col: 22 },
			],
		);
		strictEqual(HTML.slice(30, 41), 'I18n.demo.B');
	});

	test('tells a comment from code, the barrel from a constant and a bare key from a piped one', () => {
		const found = usagesInText(HTML, 'page.html', { pipe: 'i18n' });

		deepStrictEqual(
			found.map(({ key, barrel, commented, bare }) => ({ key, barrel, commented, bare })),
			[
				{ key: 'A', barrel: true, commented: true, bare: false },
				{ key: 'B', barrel: true, commented: false, bare: true },
				{ key: 'C', barrel: false, commented: false, bare: false },
			],
		);
	});

	test('takes no key for bare without a pipe to look for, or outside a template', () => {
		const bareOf = (file, options) => usagesInText(HTML, file, options).map(({ bare }) => bare);

		deepStrictEqual(bareOf('page.html', {}), [false, false, false]);
		deepStrictEqual(bareOf('page.ts', { pipe: 'i18n' }), [false, false, false]);
	});

	test('reads the scope in kebab-case, as the catalogue names it', () => {
		const [found] = usagesInText('I18n.authFlow.LOG_IN;', 'page.ts');

		deepStrictEqual({ scope: found.scope, key: found.key }, { scope: 'auth-flow', key: 'LOG_IN' });
	});
});

describe('readBarrel', () => {
	test('reads the scopes of I18n and every member of the I18nParams intersection', () => {
		const root = project({
			'i18n/index.ts': [
				"import { DemoI18n } from './demo/keys';",
				'export const I18n = { demo: DemoI18n, authFlow: AuthFlowI18n } as const;',
				'export type I18nParams = DemoI18nParams & AuthFlowI18nParams & CommonI18nParams;',
				'',
			].join('\n'),
		});
		const barrel = readBarrel(path.join(root, 'i18n'));

		deepStrictEqual([...barrel.scopes], ['demo', 'auth-flow']);
		deepStrictEqual([...barrel.params], ['DemoI18nParams', 'AuthFlowI18nParams', 'CommonI18nParams']);
		deepStrictEqual([barrel.line, barrel.col, barrel.paramsAt], [2, 14, { line: 3, col: 1 }]);
	});

	test('reads nothing from a barrel that is not there', () => {
		const barrel = readBarrel(path.join(project({}), 'i18n'));

		deepStrictEqual([barrel.exists, barrel.scopes.size, barrel.params.size], [false, 0, 0]);
	});
});

describe('readScopes', () => {
	const scopesIn = (root) =>
		readScopes({ i18nDir: path.join(root, 'i18n'), langs: ['en-GB'], rootScope: 'common' });

	test('finds no scope where the catalogue directory is not there', () => {
		deepStrictEqual(scopesIn(project({})), []);
	});

	test('finds the constant of keys.ts past the imports above it', () => {
		const root = project({
			'i18n/demo/keys.ts': [
				"import type { Brand } from './brand';",
				'',
				`export const DemoI18n = {\n\tSAVE: 'demo.${ULID}',\n} as const;`,
				'',
			].join('\n'),
		});
		const [{ keys }] = scopesIn(root);

		deepStrictEqual([keys.constName, keys.constAt], ['DemoI18n', { line: 3, col: 14 }]);
	});

	test('still reads the keys of a keys.ts that declares no constant', () => {
		const root = project({ 'i18n/demo/keys.ts': `export default {\n\tSAVE: 'demo.${ULID}',\n};\n` });
		const [{ keys }] = scopesIn(root);

		deepStrictEqual([keys.constName, keys.constAt, keys.entries.length], [null, {}, 1]);
	});
});
