import { collectUsages, readScopes } from '../catalogue/collect.mjs';
import { withTexts } from '../catalogue/files.mjs';
import { freshnessIn, readStates, tallyOf } from '../catalogue/freshness.mjs';
import { paramsFile, readDeclaredParams } from '../catalogue/params.mjs';

import { withRule } from './findings.mjs';
import { buildFindings } from './rules.mjs';

function declaredParamsOf(scopes) {
	return new Map(scopes.flatMap((scope) => [...readDeclaredParams(paramsFile(scope.dir))]));
}

function read(project, given) {
	const scopes = given.scopes ?? readScopes(project);
	const sources = given.sources ?? collectUsages(project.sourceDirs, { pipe: project.pipe });
	const freshness = freshnessIn(scopes, readStates(project.i18nDir, scopes), project);

	return {
		scopes,
		sources,
		findings: buildFindings({ ...project, ...sources, scopes }).map(withRule),
		freshness,
		tally: tallyOf(freshness, project),
		params: declaredParamsOf(scopes),
	};
}

// The whole picture in one pass: the scopes as they were read, what the sources refer to,
// every finding with what the registry knows about its rule, and how fresh each translation
// is. `texts` are files as an editor holds them, path to content, read instead of the disk.
// `sources` and `scopes` hand back what an earlier pass already read, to skip reading it again.
export function analyse(project, { texts = new Map(), scopes, sources } = {}) {
	return withTexts(texts, () => read(project, { scopes, sources }));
}
