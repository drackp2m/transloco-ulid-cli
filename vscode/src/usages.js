const vscode = require('vscode');

function locationOf({ file, line, col, length }) {
	const start = new vscode.Position(line - 1, col - 1);
	const range = new vscode.Range(start, start.translate(0, length));

	return new vscode.Location(vscode.Uri.file(file), range);
}

class UsageIndex {
	constructor(index) {
		this.index = index;
	}

	locationsOf(scopeName, keyName) {
		return this.index.analysis.sources.sites
			.filter((site) => site.scope === scopeName && site.key === keyName)
			.map(locationOf);
	}
}

module.exports = { UsageIndex };
