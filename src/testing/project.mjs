import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { createCatalogue } from './catalogue.mjs';

export const LANGS = ['en-GB', 'es-ES'];
export const SAVE = { name: 'SAVE', texts: { 'en-GB': 'Save', 'es-ES': 'Guardar' }, seal: true };
export const DELETE = { name: 'DELETE', texts: { 'en-GB': 'Delete', 'es-ES': '' } };
export const PLURAL = '{count, plural, one {# challenge} other {# challenges}}';
export const STALE = { name: 'GREET', texts: { 'en-GB': 'Hello {name}', 'es-ES': 'Hola {name}' }, seal: 'Hi {name}' };
export const COMMENTED = { name: 'KEY', texts: { 'en-GB': 'Key', 'es-ES': 'Clave' }, seal: true, used: false };
export const IN_A_COMMENT = '<!-- {{ I18n.demo.KEY | i18n }} -->';

export const project = (keys = [SAVE, DELETE]) => createCatalogue({ langs: LANGS, keys });

export const read = (file) => readFileSync(file, 'utf8');

export const spanishOf = (catalogue) => JSON.parse(read(path.join(catalogue.scopeDir, 'es-ES.json')));

export const keysOf = (catalogue) => read(path.join(catalogue.scopeDir, 'keys.ts'));

export const xliffOf = (catalogue) => path.join(catalogue.root, 'translations', 'es-ES.xlf');

export function withoutScopes() {
	const catalogue = project([SAVE]);

	rmSync(catalogue.scopeDir, { recursive: true });

	return catalogue;
}

export function translate(catalogue, from, to) {
	const file = xliffOf(catalogue);

	writeFileSync(file, read(file).replace(from, to));
}
