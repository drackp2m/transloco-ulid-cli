import { deepStrictEqual, strictEqual, throws } from 'node:assert/strict';
import { describe, test } from 'node:test';

import { buildXliff, readXliff } from './xliff.mjs';
import { decodeXml, elementsOf, parseXml } from './xml.mjs';

const FROM_A_TMS = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xliff>
<!-- exported by a TMS -->
<xliff xmlns="urn:oasis:names:tc:xliff:document:2.0" version="2.0" srcLang='en-GB' trgLang='es-ES'>
	<file id="demo">
		<unit id="demo.GREET">
			<originalData><data id="d1">{name}</data></originalData>
			<segment state="translated">
				<source>Hello <ph id="s1" dataRef="d1"/></source>
				<target>Hola <pc id="1"><ph id="t1" dataRef="d1"/></pc>, <mrk id="m1" type="term">caf&#233;</mrk><sc id="2"/></target>
			</segment>
		</unit>
		<unit id="demo.PARTS">
			<segment state="reviewed"><source>Part one. </source><target><![CDATA[Parte <uno>. ]]></target></segment>
			<segment state="checked"><source>Part two.</source><target>Parte dos.</target></segment>
		</unit>
		<unit id="demo.OPEN"><segment><source>Open</source></segment></unit>
	</file>
</xliff>
`;

const unitsOf = (text) => readXliff(text).files[0].units;

describe('readXliff and what a TMS sends back', () => {
	test('reads the languages from attributes in either quote', () => {
		const { srcLang, trgLang } = readXliff(FROM_A_TMS);

		deepStrictEqual([srcLang, trgLang], ['en-GB', 'es-ES']);
	});

	test('resolves a placeholder through its data, inside the codes that wrap it', () => {
		const [greet] = unitsOf(FROM_A_TMS);

		deepStrictEqual([greet.source, greet.target], ['Hello {name}', 'Hola {name}, café']);
	});

	test('joins the segments of a split string, and takes the first state it knows', () => {
		const [, parts] = unitsOf(FROM_A_TMS);

		deepStrictEqual([parts.source, parts.target, parts.state], [
			'Part one. Part two.',
			'Parte <uno>. Parte dos.',
			'reviewed',
		]);
	});

	test('reads a unit without a target as untranslated', () => {
		const [, , open] = unitsOf(FROM_A_TMS);

		deepStrictEqual([open.target, open.state, open.subState], ['', 'initial', null]);
	});

	test('refuses a document with no <xliff> root', () => {
		throws(() => readXliff('<html><body/></html>'), /^Error: not an XLIFF document — no <xliff> root$/);
	});
});

describe('buildXliff', () => {
	test('writes a unit without notes, escaped, and reads it back as it was', () => {
		const unit = { id: 'demo.SAVE', source: 'Save & "close" <now>', target: '' };
		const text = buildXliff({ srcLang: 'en-GB', trgLang: 'es-ES', files: [{ id: 'demo', units: [unit] }] });

		strictEqual(text.includes('<notes>'), false);
		strictEqual(text.includes('<source>Save &amp; &quot;close&quot; &lt;now&gt;</source>'), true);
		deepStrictEqual(unitsOf(text)[0], {
			id: 'demo.SAVE',
			notes: [],
			source: 'Save & "close" <now>',
			target: '',
			state: 'initial',
			subState: null,
		});
	});
});

describe('decodeXml', () => {
	test('decodes the named, decimal and hexadecimal entities', () => {
		strictEqual(decodeXml('&lt;b&gt; &amp; &quot;x&quot; &apos;y&apos; &#233; &#xE9;'), '<b> & "x" \'y\' é é');
	});

	test('leaves an entity XML does not define as it is', () => {
		strictEqual(decodeXml('a&nbsp;b'), 'a&nbsp;b');
	});
});

describe('parseXml and a malformed document', () => {
	const namesOf = (node) => elementsOf(node).map((child) => child.name);

	test('ignores a closing tag that closes nothing, and keeps reading', () => {
		const [a] = elementsOf(parseXml('<a>one</b><c/></a>'));

		deepStrictEqual(namesOf(a), ['c']);
	});

	test('reads a ">" inside a quoted attribute as part of its value', () => {
		const [c] = elementsOf(parseXml('<c x="1>2"/>'));

		deepStrictEqual(c.attrs, { x: '1>2' });
	});

	test('skips a tag without a name, and stops at one that never closes', () => {
		const [a] = elementsOf(parseXml('<a>< ><b>two</b><c'));

		deepStrictEqual(namesOf(a), ['b']);
	});
});
