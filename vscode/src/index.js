const { existsSync } = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const settings = require('./settings');

const CLI_PACKAGE = '@drackp2m/transloco-ulid-cli';
const CLI_ENTRY = 'api.mjs';
const API_VERSIONS = [1];
const NEEDED = `${CLI_PACKAGE} 0.4.0 or later`;

const appPrefixOf = (alias) => `${alias.split('/')[0]}/`;

function installed(root, request) {
	try {
		return require.resolve(request, { paths: [root] });
	} catch {
		return null;
	}
}

function configuredEntry(dir) {
	const entry = path.join(dir, CLI_ENTRY);

	if (!existsSync(entry)) {
		throw new Error(`translocoUlidI18n.cliDir has no ${CLI_ENTRY}: ${NEEDED} is needed`);
	}

	return entry;
}

function entryOf(root) {
	const configured = settings.cliDir(root);

	if (null !== configured) {
		return configuredEntry(configured);
	}

	const entry = installed(root, CLI_PACKAGE);

	if (null !== entry) {
		return entry;
	}

	if (null !== installed(root, `${CLI_PACKAGE}/catalogue/config.mjs`)) {
		throw new Error(`the package installed in ${root} is too old: ${NEEDED} is needed`);
	}

	const fix = 'add it as a devDependency or set translocoUlidI18n.cliDir';

	throw new Error(`${CLI_PACKAGE} is not installed in ${root}: ${fix}`);
}

async function loadApi(root) {
	const entry = entryOf(root);
	const api = await import(pathToFileURL(entry).href);

	if (!API_VERSIONS.includes(api.API_VERSION)) {
		const theirs = `${CLI_PACKAGE} ${api.CLI_VERSION} speaks API ${api.API_VERSION}`;
		const ours = `this extension speaks ${API_VERSIONS.join(', ')}`;

		throw new Error(`${theirs} and ${ours}: update whichever is behind`);
	}

	return { api, cliDir: path.dirname(entry) };
}

function projectOf(api, root) {
	const base = api.loadProject(root);
	const languageFile = settings.languageFile(base.root, base);
	const { langs, defaultLang } = settings.readLanguages(api, languageFile);

	return { ...base, languageFile, langs: settings.resolveLangs(langs, defaultLang), defaultLang };
}

const EMPTY_ANALYSIS = {
	scopes: [],
	sources: { usages: new Map(), commented: new Map(), bare: [], sites: [] },
	findings: [],
	freshness: [],
	tally: new Map(),
	params: new Map(),
};

function toScope(scope) {
	const entries = scope.keys?.entries ?? [];

	return {
		name: scope.name,
		dir: scope.dir,
		keysFile: scope.keysFile,
		prefixed: scope.prefixed,
		constName: scope.keys?.constName ?? null,
		entries: new Map(entries.map((entry) => [entry.name, entry])),
		translations: scope.translations,
	};
}

class I18nIndex {
	constructor(root) {
		this.root = root;
		this.api = null;
		this.cliDir = '';
		this.project = null;
		this.aliases = { i18n: '', pipe: '', pipeClass: '', app: '' };
		this.displayLang = '';
		this.analysis = EMPTY_ANALYSIS;
		this.scopes = new Map();
		this.error = null;
	}

	get langs() {
		return this.project?.langs ?? [];
	}

	get defaultLang() {
		return this.project?.defaultLang ?? '';
	}

	get i18nDir() {
		return this.project?.i18nDir ?? '';
	}

	get sourceDirs() {
		return this.project?.sourceDirs ?? [];
	}

	get languageFile() {
		return this.project?.languageFile ?? '';
	}

	get configFile() {
		return this.project?.configFile ?? '';
	}

	get pipe() {
		return this.project?.pipe ?? '';
	}

	get rawScopes() {
		return this.analysis.scopes;
	}

	entry(scopeName, keyName) {
		return this.scopes.get(scopeName)?.entries.get(keyName) ?? null;
	}

	entryByUlid(scopeName, ulid) {
		const entries = this.scopes.get(scopeName)?.entries.values() ?? [];

		return [...entries].find((entry) => entry.ulid === ulid) ?? null;
	}

	findUsages(text, file) {
		return this.api?.usagesIn(text, file, { pipe: this.pipe }) ?? [];
	}

	paramsOf(scopeName, keyName) {
		const declared = this.analysis.params.get(this.entry(scopeName, keyName)?.value);

		return undefined === declared ? [] : [...declared].map(([name, type]) => ({ name, type }));
	}

	keysOf(scopeName) {
		return [...(this.scopes.get(scopeName)?.entries.keys() ?? [])];
	}

	async reload() {
		try {
			await this.readWorkspace();
			this.error = null;
		} catch (error) {
			this.error = error instanceof Error ? error.message : String(error);
			this.take(EMPTY_ANALYSIS);
		}

		return this.error;
	}

	analyse(options) {
		this.take(this.api.analyse(this.project, options));
	}

	take(analysis) {
		this.analysis = analysis;
		this.scopes = new Map(analysis.scopes.map((scope) => [scope.name, toScope(scope)]));
	}

	scopeAt(dir) {
		return [...this.scopes.values()].find((scope) => scope.dir === dir) ?? null;
	}

	scopeNames() {
		return [...this.scopes.keys()];
	}

	toKebabCase(name) {
		return this.api.toKebabCase(name);
	}

	translation(scopeName, ulid, lang) {
		const source = this.scopes.get(scopeName)?.translations.get(lang);

		if (!source?.data) {
			return { file: source?.file ?? null, text: null, missing: true };
		}

		const text = source.data[ulid];

		return {
			file: source.file,
			text: text ?? null,
			missing: undefined === text || '' === String(text).trim(),
		};
	}

	async readWorkspace() {
		const { api, cliDir } = await loadApi(this.root);
		const project = projectOf(api, this.root);

		this.api = api;
		this.cliDir = cliDir;
		this.project = project;
		this.displayLang = settings.resolveDisplayLang(project.langs, project.defaultLang);
		this.aliases = {
			i18n: project.importAlias,
			pipe: settings.pipeImport(),
			pipeClass: settings.pipeClass(),
			app: appPrefixOf(project.importAlias),
		};
		this.analyse({});
	}
}

module.exports = { I18nIndex };
