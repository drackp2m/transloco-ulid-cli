export const c = {
	reset: '\x1b[0m',
	dim: '\x1b[2m',
	bold: '\x1b[1m',
	underline: '\x1b[4m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	red: '\x1b[31m',
	cyan: '\x1b[36m',
	blue: '\x1b[34m',
};

const SEVERITY_COLOR = { error: c.red, warning: c.yellow, info: c.blue };

export const plural = (value, word) => `${value} ${word}${1 === value ? '' : 's'}`;

const locationOf = (item) => (undefined !== item.line ? `${item.line}:${item.col}` : '');

export function printProblems(problems) {
	const byFile = new Map();

	for (const problem of problems) {
		if (!byFile.has(problem.file)) {
			byFile.set(problem.file, []);
		}
		byFile.get(problem.file).push(problem);
	}

	for (const [file, items] of byFile) {
		const locWidth = Math.max(...items.map((item) => locationOf(item).length));
		const sevWidth = Math.max(...items.map((item) => item.severity.length));
		const msgWidth = Math.max(...items.map((item) => item.message.length));

		console.log(`\n${c.underline}${file}${c.reset}`);

		for (const item of items) {
			const location = locationOf(item).padEnd(locWidth);
			const color = SEVERITY_COLOR[item.severity] ?? c.yellow;
			const severity = item.severity.padEnd(sevWidth);
			const rule = item.rule ? `${c.dim}${item.rule}${c.reset}` : '';
			console.log(
				`  ${c.dim}${location}${c.reset}  ${color}${severity}${c.reset}  ` +
					`${item.message.padEnd(msgWidth)}  ${rule}`,
			);
		}
	}
}

// The tally ESLint prints under the problems. Callers keep infos out of this list: they
// are not problems, so they never reach the tally or the exit code.
export function printTally(problems) {
	const errors = problems.filter((problem) => 'error' === problem.severity).length;
	const warnings = problems.length - errors;
	const icon = 0 !== errors ? `${c.red}✖${c.reset}` : `${c.yellow}⚠${c.reset}`;
	const errorBlock =
		0 !== errors ? `${c.red}${plural(errors, 'error')}${c.reset}` : plural(errors, 'error');
	const warningBlock =
		0 !== warnings
			? `${c.yellow}${plural(warnings, 'warning')}${c.reset}`
			: plural(warnings, 'warning');

	console.log(`\n  ${icon} ${plural(problems.length, 'problem')} (${errorBlock}, ${warningBlock})`);
}
