const vscode = require('vscode');

const { jsonLocation, keyTargets } = require('./navigation');
const { displayFirst, shorten } = require('./util');

const TEXT_LENGTH = 80;
const ULID_FRAGMENT = /^[0-9a-hjkmnp-tv-z]{4,26}$/;
const RANK = { prefix: 0, key: 1, ulid: 2, display: 3, text: 4 };

const folded = (text) =>
	String(text ?? '')
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.toLowerCase();

function recordOf(index, scope, key) {
	const { ulid } = index.entry(scope, key);
	const texts = displayFirst(index).map((lang) => {
		const text = String(index.translation(scope, ulid, lang).text ?? '');

		return { lang, text, folded: folded(text) };
	});

	return { scope, key, ulid, texts, name: folded(key), scoped: folded(`${scope}.${key}`) };
}

function recordsOf(index) {
	const keysIn = (scope) => index.keysOf(scope).map((key) => recordOf(index, scope, key));

	return index.scopeNames().flatMap(keysIn);
}

function keyMatch(record, query) {
	const wanted = query.replace(/\s+/g, '_');

	if (!record.scoped.includes(wanted)) {
		return null;
	}

	return { kind: 'key', rank: record.name.startsWith(wanted) ? RANK.prefix : RANK.key };
}

function ulidMatch(record, query) {
	const wanted = query.split('.').pop();

	return ULID_FRAGMENT.test(wanted) && folded(record.ulid).includes(wanted)
		? { kind: 'ulid', rank: RANK.ulid }
		: null;
}

function textMatch(record, query) {
	const position = record.texts.findIndex((text) => text.folded.includes(query));

	if (-1 === position) {
		return null;
	}

	const rank = 0 === position ? RANK.display : RANK.text;

	return { kind: 'text', rank, shown: record.texts[position] };
}

function matchOf(record, query) {
	if ('' === query) {
		return { kind: 'key', rank: RANK.prefix };
	}

	return keyMatch(record, query) ?? ulidMatch(record, query) ?? textMatch(record, query);
}

function detailOf(record, shown) {
	const text = '' === shown.text.trim() ? '—' : shorten(shown.text, TEXT_LENGTH);

	return shown === record.texts[0] ? text : `${shown.lang} · ${text}`;
}

function itemOf({ record, match }) {
	return {
		label: record.key,
		description: `${record.scope} · ${record.ulid}`,
		detail: detailOf(record, match.shown ?? record.texts[0]),
		alwaysShow: true,
		record,
		match,
	};
}

function resultsOf(records, value) {
	const query = folded(value).trim();

	return records
		.map((record) => ({ record, match: matchOf(record, query) }))
		.filter(({ match }) => null !== match)
		.sort((a, b) => a.match.rank - b.match.rank)
		.map(itemOf);
}

function pick(records, displayLang) {
	const picker = vscode.window.createQuickPick();

	picker.title = `Search translation keys · texts in ${displayLang}`;
	picker.placeholder = 'Key name, ULID or text in any language';
	picker.items = resultsOf(records, '');
	picker.onDidChangeValue((value) => {
		picker.items = resultsOf(records, value);
	});

	return new Promise((resolve) => {
		picker.onDidAccept(() => resolve(picker.selectedItems[0]));
		picker.onDidHide(() => resolve(undefined));
		picker.show();
	}).finally(() => picker.dispose());
}

function targetOf(index, { record, match }) {
	if ('text' === match.kind) {
		const { file } = index.translation(record.scope, record.ulid, match.shown.lang);

		return jsonLocation(file, record.ulid, 'value');
	}

	const [location] = keyTargets(index, index.scopes.get(record.scope), record.ulid);

	return location ?? null;
}

async function searchKeys(index) {
	if (null !== index.error) {
		throw new Error(index.error);
	}

	const chosen = await pick(recordsOf(index), index.displayLang);
	const location = undefined === chosen ? null : targetOf(index, chosen);

	if (null !== location) {
		await vscode.window.showTextDocument(location.uri, { selection: location.range });
	}
}

module.exports = { folded, matchOf, recordsOf, searchKeys };
