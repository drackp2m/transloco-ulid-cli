const vscode = require('vscode');

const { applyInsertion } = require('./params');
const { snippetItems } = require('./snippet');
const { SELECTOR, displayFirst, locate, shorten, usageAt, usageRange } = require('./util');

const MISSING = '⚠️ _missing translation_';
const MISSING_DESCRIPTION = '⚠️ missing translation';
const DESCRIPTION_LENGTH = 80;

const BARREL_KEY = /\bI18n\s*\.\s*([a-z][A-Za-z0-9]*)\s*\.\s*[A-Z0-9_]*$/;
const CONST_KEY = /\b([A-Z][A-Za-z0-9]*)I18n\s*\.\s*[A-Z0-9_]*$/;
const BARREL_SCOPE = /\bI18n\s*\.\s*[A-Za-z0-9]*$/;

function translationRows(index, scope, ulid) {
	return index.langs.map((lang) => {
		const { text, missing } = index.translation(scope, ulid, lang);

		return `| \`${lang}\` | ${missing ? MISSING : text.replace(/\|/g, '\\|')} |`;
	});
}

function paramsBlock(index, usage) {
	const params = index.paramsOf(usage.scope, usage.key);

	if (0 === params.length) {
		return [];
	}

	const signature = params.map(({ name, type }) => `${name}: ${type}`).join(', ');

	return ['', '```typescript', `(${signature}) => string`, '```'];
}

function hoverContent(index, usage) {
	const entry = index.entry(usage.scope, usage.key);

	if (null === entry) {
		return new vscode.MarkdownString(`⚠️ \`${usage.key}\` is not declared in \`${usage.scope}\``);
	}

	const markdown = new vscode.MarkdownString(
		[
			`**${usage.scope}.${usage.key}**`,
			'',
			'| | |',
			'| --- | --- |',
			...translationRows(index, usage.scope, entry.ulid),
			...paramsBlock(index, usage),
			'',
			`\`${entry.value}\``,
		].join('\n'),
	);

	markdown.supportHtml = false;

	return markdown;
}

function hoverProvider(index) {
	return vscode.languages.registerHoverProvider(SELECTOR, {
		provideHover(document, position) {
			const usage = usageAt(index, document, position);

			return null === usage
				? null
				: new vscode.Hover(hoverContent(index, usage), usageRange(document, usage));
		},
	});
}

function definitionTargets(index, usage) {
	const entry = index.entry(usage.scope, usage.key);

	if (null === entry) {
		return [];
	}

	return displayFirst(index)
		.map((lang) => locate(index.translation(usage.scope, entry.ulid, lang).file, entry.ulid))
		.filter((target) => null !== target);
}

function definitionProvider(index) {
	return vscode.languages.registerDefinitionProvider(SELECTOR, {
		provideDefinition(document, position) {
			const usage = usageAt(index, document, position);

			return null === usage ? null : definitionTargets(index, usage);
		},
	});
}

function languageRows(index, scope, ulid) {
	return new vscode.MarkdownString(
		index.langs
			.map((lang) => {
				const value = index.translation(scope, ulid, lang);

				return `- \`${lang}\` ${value.missing ? MISSING : value.text}`;
			})
			.join('\n'),
	);
}

function keyItem(index, scope, key, order, context) {
	const entry = index.entry(scope, key);
	const { text, missing } = index.translation(scope, entry.ulid, index.displayLang);
	const description = missing ? MISSING_DESCRIPTION : shorten(text, DESCRIPTION_LENGTH);
	const item = new vscode.CompletionItem(
		{ label: key, description },
		vscode.CompletionItemKind.Constant,
	);

	item.detail = entry.value;
	item.documentation = languageRows(index, scope, entry.ulid);
	item.sortText = String(order).padStart(4, '0');
	item.preselect = true;
	item.filterText = key;

	applyInsertion(index, scope, key, item, context);

	return item;
}

function keyItems(index, scope, context) {
	return index.keysOf(scope).map((key, order) => keyItem(index, scope, key, order, context));
}

function scopeItems(index) {
	return index.scopeNames().map((name) => {
		const keys = index.keysOf(name).length;

		return new vscode.CompletionItem(
			{ label: name, description: `${keys} ${1 === keys ? 'key' : 'keys'}` },
			vscode.CompletionItemKind.Module,
		);
	});
}

function completionsFor(index, context) {
	const { document, prefix } = context;
	const scope = BARREL_KEY.exec(prefix)?.[1] ?? CONST_KEY.exec(prefix)?.[1];

	if (0 === index.scopes.size) {
		return null;
	}

	if (undefined !== scope) {
		return keyItems(index, index.toKebabCase(scope), context);
	}

	return BARREL_SCOPE.test(prefix) ? scopeItems(index) : snippetItems(document, prefix, index);
}

function completionContext(document, position) {
	const line = document.lineAt(position.line);

	return {
		document,
		position,
		prefix: document.getText(new vscode.Range(line.range.start, position)),
		suffix: document.getText(new vscode.Range(position, line.range.end)),
	};
}

function completionProvider(index) {
	return vscode.languages.registerCompletionItemProvider(
		SELECTOR,
		{
			provideCompletionItems(document, position) {
				return completionsFor(index, completionContext(document, position));
			},
		},
		'.',
	);
}

module.exports = { completionProvider, definitionProvider, hoverProvider };
