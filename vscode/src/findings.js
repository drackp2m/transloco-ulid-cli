const { readFileSync } = require('node:fs');
const path = require('node:path');

const vscode = require('vscode');

const { report } = require('./output');

const DEBOUNCE = 750;
const LINE_END = Number.MAX_SAFE_INTEGER;
const RELATED_LIMIT = 6;
const SOURCE_LANGUAGES = new Set(['typescript', 'html']);
const PROJECTED_GROUPS = new Set(['pending', 'message']);
const FADED_TYPES = new Set(['unused-key', 'commented-usage']);
const UNNECESSARY_TYPES = new Set(['orphan-translation']);

const SEVERITIES = {
	error: vscode.DiagnosticSeverity.Error,
	warning: vscode.DiagnosticSeverity.Warning,
	info: vscode.DiagnosticSeverity.Information,
};

const severityOf = ({ group, severity }) =>
	'pending' === group ? SEVERITIES.warning : SEVERITIES[severity];

const worded = ({ message, lang }) => (null === lang ? message : `${message} [${lang}]`);

function rangeOf(finding) {
	const line = Math.max((finding.line ?? 1) - 1, 0);
	const start = Math.max((finding.col ?? 1) - 1, 0);

	return new vscode.Range(line, start, line, LINE_END);
}

function diagnosticOf(range, message, finding) {
	const diagnostic = new vscode.Diagnostic(range, message, severityOf(finding));

	diagnostic.code = finding.type;
	diagnostic.source = 'i18n';

	if (UNNECESSARY_TYPES.has(finding.type)) {
		diagnostic.tags = [vscode.DiagnosticTag.Unnecessary];
	}

	return diagnostic;
}

function unsavedTexts() {
	return new Map(
		vscode.workspace.textDocuments
			.filter((document) => document.isDirty && 'file' === document.uri.scheme)
			.map((document) => [document.uri.fsPath, document.getText()]),
	);
}

const idOf = ({ scope, key }) => `${scope}:${key}`;

function byKey(findings) {
	const groups = new Map();

	for (const finding of findings) {
		if (null !== finding.key && PROJECTED_GROUPS.has(finding.group)) {
			groups.set(idOf(finding), [...(groups.get(idOf(finding)) ?? []), finding]);
		}
	}

	return groups;
}

function byType(findings) {
	const groups = new Map();

	for (const finding of findings) {
		groups.set(finding.type, [...(groups.get(finding.type) ?? []), finding]);
	}

	return [...groups.values()];
}

function relatedOf(findings) {
	return findings.slice(0, RELATED_LIMIT).map((finding) => {
		const location = new vscode.Location(vscode.Uri.file(finding.file), rangeOf(finding).start);

		return new vscode.DiagnosticRelatedInformation(location, finding.message);
	});
}

function summaryOf(usage, findings) {
	const [first] = findings;

	if (1 === findings.length) {
		return worded(first);
	}

	const langs = [...new Set(findings.map(({ lang }) => lang).filter((lang) => null !== lang))];
	const where = 0 === langs.length ? '' : ` [${langs.join(', ')}]`;

	return `${usage.scope}.${usage.key}: ${first.meaning}${where}`;
}

const placeOf = (file, { line, col }) => `${file}:${line}:${col}`;

const usedRange = (document, usage) =>
	new vscode.Range(document.positionAt(usage.start), document.positionAt(usage.end));

function projectedOn(range, usage, findings) {
	return byType(findings).map((group) => {
		const diagnostic = diagnosticOf(range, summaryOf(usage, group), group[0]);

		diagnostic.relatedInformation = relatedOf(group);

		return diagnostic;
	});
}

function linesOf(file) {
	const open = vscode.workspace.textDocuments.find(
		(document) => 'file' === document.uri.scheme && file === document.uri.fsPath,
	);

	try {
		return (open?.getText() ?? readFileSync(file, 'utf8')).split('\n');
	} catch {
		return [];
	}
}

function blockEnd(lines, line) {
	if (lines[line].includes('}')) {
		return line;
	}

	const end = lines.findIndex((content, at) => at > line && content.trimStart().startsWith('}'));

	return -1 === end ? line : end;
}

function entryRange(lines, { needle, block }) {
	const line = lines.findIndex((content) => content.includes(needle));

	if (-1 === line) {
		return null;
	}

	const start = Math.max(lines[line].search(/\S/), 0);

	return new vscode.Range(line, start, block ? blockEnd(lines, line) : line, LINE_END);
}

function fadedOn(range, finding) {
	const diagnostic = new vscode.Diagnostic(range, finding.message, vscode.DiagnosticSeverity.Hint);

	diagnostic.code = finding.type;
	diagnostic.source = 'i18n';
	diagnostic.tags = [vscode.DiagnosticTag.Unnecessary];
	diagnostic.relatedInformation = relatedOf([finding]);

	return diagnostic;
}

const isSource = (document) =>
	'file' === document.uri.scheme && SOURCE_LANGUAGES.has(document.languageId);

class Findings {
	constructor(index) {
		this.index = index;
		this.diagnostics = vscode.languages.createDiagnosticCollection('transloco-ulid-i18n');
		this.timer = null;
		this.rescan = false;
		this.changed = new vscode.EventEmitter();
		this.onDidChange = this.changed.event;
	}

	get items() {
		return this.index.analysis.findings;
	}

	dispose() {
		if (null !== this.timer) {
			clearTimeout(this.timer);
		}

		this.diagnostics.dispose();
		this.changed.dispose();
	}

	schedule({ sources = false } = {}) {
		this.rescan = this.rescan || sources;

		if (null !== this.timer) {
			clearTimeout(this.timer);
		}

		this.timer = setTimeout(() => this.refresh(), DEBOUNCE);
	}

	refresh() {
		this.timer = null;

		if (null === this.index.error) {
			this.analyse();
		}

		this.show();
	}

	show() {
		this.publish();
		this.changed.fire(undefined);
	}

	analyse() {
		const sources = this.rescan ? undefined : this.index.analysis.sources;

		this.rescan = false;

		try {
			this.index.analyse({ texts: unsavedTexts(), sources });
		} catch (error) {
			report([error instanceof Error ? error.message : String(error)]);
		}
	}

	publish() {
		const byFile = new Map();
		const add = (file, diagnostic) => byFile.set(file, [...(byFile.get(file) ?? []), diagnostic]);
		const open = this.openUsages();
		const ranges = new Map(open.map((used) => [placeOf(used.file, used.usage), used.range]));

		for (const finding of this.items) {
			const range = ranges.get(placeOf(finding.file, finding)) ?? rangeOf(finding);

			add(finding.file, diagnosticOf(range, finding.message, finding));
		}

		for (const { file, diagnostic } of [...this.projected(open), ...this.faded()]) {
			add(file, diagnostic);
		}

		this.diagnostics.clear();

		for (const [file, diagnostics] of byFile) {
			this.diagnostics.set(vscode.Uri.file(file), diagnostics);
		}
	}

	openUsages() {
		return vscode.workspace.textDocuments.filter(isSource).flatMap((document) => {
			const file = document.uri.fsPath;

			return this.index
				.findUsages(document.getText(), file)
				.map((usage) => ({ file, usage, range: usedRange(document, usage) }));
		});
	}

	projected(open) {
		const groups = byKey(this.items);

		return open
			.filter(({ usage }) => !usage.commented && groups.has(idOf(usage)))
			.flatMap(({ file, usage, range }) =>
				projectedOn(range, usage, groups.get(idOf(usage))).map((diagnostic) => ({
					file,
					diagnostic,
				})),
			);
	}

	entriesOf({ scope: scopeName, ulid }) {
		const scope = this.index.scopes.get(scopeName);

		if (undefined === scope) {
			return [];
		}

		const translations = [...scope.translations.values()].map(({ file }) => ({
			file,
			needle: `"${ulid}"`,
			block: false,
		}));

		return [
			...translations,
			{ file: path.join(scope.dir, 'params.ts'), needle: `.${ulid}'`, block: true },
		];
	}

	faded() {
		const read = new Map();
		const lines = (file) => read.get(file) ?? read.set(file, linesOf(file)).get(file);

		return this.items
			.filter(({ type, ulid }) => FADED_TYPES.has(type) && null !== ulid)
			.flatMap((finding) =>
				this.entriesOf(finding).map((entry) => ({
					file: entry.file,
					range: entryRange(lines(entry.file), entry),
					finding,
				})),
			)
			.filter(({ range }) => null !== range)
			.map(({ file, range, finding }) => ({ file, diagnostic: fadedOn(range, finding) }));
	}
}

module.exports = { Findings };
