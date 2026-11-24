import { readDefaults } from '../catalogue/config.mjs';
import { c } from '../shared/terminal.mjs';

const linesOf = (defaults) => [
	`${c.bold}Usage:${c.reset} transloco-ulid prune [options]`,
	'',
	'Lists the keys nothing in the sources references and removes the ones you confirm:',
	'their line in keys.ts, their entry in every <lang>.json, their seals in state/ and',
	'their params.ts entry. A key only a comment mentions is kept. It asks first:',
	'y removes them all, N (the default) none, s opens a list with every key ticked.',
	'',
	`${c.bold}Options:${c.reset}`,
	`  ${c.cyan}--scope${c.reset} <names>    comma-separated scopes to look in (default: all of them)`,
	`  ${c.cyan}--yes${c.reset}, ${c.cyan}-y${c.reset}          remove every one without asking — needed without a terminal`,
	`  ${c.cyan}--dry-run${c.reset}          list them and the files that would change, and write nothing`,
	`  ${c.cyan}--dir${c.reset} <path>       catalogue directory (default: ${defaults.i18nDir})`,
	`  ${c.cyan}--source${c.reset} <dirs>    comma-separated source directories (default: sourceDirs)`,
	`  ${c.cyan}--languages${c.reset} <file> file LANGUAGES / DEFAULT_LANGUAGE are read from`,
	`  ${c.cyan}--help${c.reset}, ${c.cyan}-h${c.reset}         print this text`,
	'',
	'A key may be unused because a refactor lost its usage: read the list before saying y.',
	'',
	`${c.bold}Examples:${c.reset}`,
	`  ${c.dim}transloco-ulid prune --dry-run${c.reset}`,
	`  ${c.dim}transloco-ulid prune --scope dashboard${c.reset}`,
];

export const printPruneUsage = () => console.log(linesOf(readDefaults()).join('\n'));
