// A tolerant pull parser, small enough to keep XLIFF dependency-free. What a TMS returns is
// well-formed but unpredictable in shape, so the tree is walked by name and not position.
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const ATTRIBUTE = /([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const TAG_NAME = /^\/?\s*([\w.:-]+)/;

export function decodeXml(text) {
	return String(text).replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (match, entity) => {
		if ('#' !== entity[0]) {
			return ENTITIES[entity] ?? match;
		}

		const code = 'x' === entity[1] ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));

		return Number.isNaN(code) ? match : String.fromCodePoint(code);
	});
}

export const encodeXml = (text) =>
	String(text)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');

function attributesOf(source) {
	const attrs = {};

	for (const [, name, quoted, single] of source.matchAll(ATTRIBUTE)) {
		attrs[name] = decodeXml(quoted ?? single ?? '');
	}

	return attrs;
}

// <?…?>, <!--…-->, <![CDATA[…]]> and <!DOCTYPE…>: only the CDATA carries text.
function readSpecial(source, index) {
	const openers = [
		['<?', '?>', 2],
		['<!--', '-->', 4],
		['<![CDATA[', ']]>', 9],
	];

	for (const [open, close, skip] of openers) {
		if (source.startsWith(open, index)) {
			const end = source.indexOf(close, index + skip);
			const stop = -1 === end ? source.length : end;
			const text = '<![CDATA[' === open ? source.slice(index + skip, stop) : '';

			return { next: -1 === end ? source.length : end + close.length, text };
		}
	}

	if (!source.startsWith('<!', index)) {
		return null;
	}

	const end = source.indexOf('>', index);

	return { next: -1 === end ? source.length : end + 1, text: '' };
}

function endOfTag(source, start) {
	let quote = null;

	for (let index = start; index < source.length; index += 1) {
		const char = source[index];

		if (null !== quote) {
			quote = char === quote ? null : quote;
		} else if ('"' === char || "'" === char) {
			quote = char;
		} else if ('>' === char) {
			return index;
		}
	}

	return -1;
}

function pushText(stack, text) {
	if ('' !== text) {
		stack.at(-1).children.push({ name: '#text', text: decodeXml(text) });
	}
}

// An unmatched closing tag is ignored instead of unwinding the whole stack, so
// one malformed island never swallows the units that follow it.
function closeElement(stack, name) {
	const depth = stack.findLastIndex((node) => node.name === name);

	if (0 < depth) {
		stack.length = depth;
	}
}

function readTag(source, open, stack) {
	const close = endOfTag(source, open + 1);

	if (-1 === close) {
		return source.length;
	}

	const raw = source.slice(open + 1, close);
	const body = raw.endsWith('/') ? raw.slice(0, -1) : raw;
	const name = TAG_NAME.exec(body)?.[1];

	if (undefined === name) {
		return close + 1;
	}

	if (body.startsWith('/')) {
		closeElement(stack, name);

		return close + 1;
	}

	const node = { name, attrs: attributesOf(body.slice(body.indexOf(name) + name.length)) };

	node.children = [];
	stack.at(-1).children.push(node);

	if (!raw.endsWith('/')) {
		stack.push(node);
	}

	return close + 1;
}

export function parseXml(source) {
	const root = { name: '#root', attrs: {}, children: [] };
	const stack = [root];
	let index = 0;

	while (index < source.length) {
		const open = source.indexOf('<', index);

		if (-1 === open) {
			pushText(stack, source.slice(index));

			break;
		}

		pushText(stack, source.slice(index, open));

		const special = readSpecial(source, open);

		if (null === special) {
			index = readTag(source, open, stack);
		} else {
			pushText(stack, special.text);
			index = special.next;
		}
	}

	return root;
}

export const elementsOf = (node) => (node.children ?? []).filter((child) => '#text' !== child.name);

export function childrenNamed(node, name) {
	return elementsOf(node).filter((child) => child.name === name);
}

export const firstNamed = (node, name) => childrenNamed(node, name)[0] ?? null;

export function findAll(node, name) {
	const pick = (child) => (child.name === name ? [child] : findAll(child, name));

	return elementsOf(node).flatMap((child) => pick(child));
}
