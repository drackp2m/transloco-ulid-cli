import { plural } from '../../lint/lint-report.mjs';
import { inStepSummary, writeStepSummary } from '../../util/github-summary.mjs';

import { FIXABLE_TYPES, cellsOf, columnsOf, severityOf } from './findings.mjs';

const ICONS = { ok: '✅', warning: '⚠️', error: '❌' };

const keyCount = (scopes) =>
	scopes.reduce((total, scope) => total + (scope.keys?.entries.length ?? 0), 0);

function scopeTable(scopes, findings, langs) {
	const columns = columnsOf(langs);
	const rows = scopes.map((scope) => {
		const cells = cellsOf(scope, findings, columns).map((status) => ICONS[status]);

		return `| \`${scope.name}\` | ${cells.join(' | ')} |`;
	});

	return [
		`| scope | ${columns.join(' | ')} |`,
		`| :--- | ${columns.map(() => ':---:').join(' | ')} |`,
		...rows,
	];
}

function ruleTable(problems) {
	const counts = new Map();

	for (const { type } of problems) {
		const current = counts.get(type) ?? { errors: 0, warnings: 0 };

		current['error' === severityOf(type) ? 'errors' : 'warnings'] += 1;
		counts.set(type, current);
	}

	const rows = [...counts.entries()]
		.sort(([, left], [, right]) => right.errors - left.errors || right.warnings - left.warnings)
		.map(([type, { errors, warnings }]) => `| \`${type}\` | ${errors} | ${warnings} |`);

	return ['| rule | errors | warnings |', '| :--- | ---: | ---: |', ...rows];
}

function verdictOf(problems) {
	const errors = problems.filter(({ type }) => 'error' === severityOf(type)).length;
	const warnings = problems.length - errors;

	if (0 !== errors) {
		return `> ❌ ${plural(errors, 'error')} · ${plural(warnings, 'warning')}.`;
	}

	if (0 !== warnings) {
		return `> ⚠️ ${plural(warnings, 'warning')} — no errors.`;
	}

	return '> ✅ Every key is declared, translated and used.';
}

function fixableLine(findings, fix) {
	const fixable = findings.filter(({ type }) => FIXABLE_TYPES.has(type)).length;

	if (fix || 0 === fixable) {
		return [];
	}

	return ['', `_${plural(fixable, 'problem')} potentially fixable with the \`--fix\` option._`];
}

function i18nSummary({ scopes, findings, langs, fix }) {
	const details = [
		plural(scopes.length, 'scope'),
		plural(langs.length, 'language'),
		plural(keyCount(scopes), 'key'),
	].join(' · ');
	const problems = findings.filter(({ type }) => 'info' !== severityOf(type));
	const infos = findings.length - problems.length;
	const sections = [
		'## i18n Report',
		'',
		`_${details}_`,
		'',
		'### Scopes',
		'',
		...scopeTable(scopes, findings, langs),
	];

	if (0 !== problems.length) {
		sections.push('', '### Problems', '', ...ruleTable(problems));
	}

	sections.push('', verdictOf(problems), ...fixableLine(findings, fix));

	if (0 !== infos) {
		sections.push('', `_${plural(infos, 'note')} printed in the step log._`);
	}

	return [...sections, ''];
}

// Never fail the check because of its own report: a summary is a side effect,
// the exit code belongs to the findings.
export function writeI18nSummary(context) {
	if (!inStepSummary()) {
		return;
	}

	try {
		writeStepSummary(i18nSummary(context).join('\n'));
	} catch {
		// ignore
	}
}

export function writeSkippedSummary(i18nDir) {
	if (!inStepSummary()) {
		return;
	}

	writeStepSummary(
		['## i18n Report', '', `> ⊘ Skipped — no scopes in \`${i18nDir}\`.`, ''].join('\n'),
	);
}
