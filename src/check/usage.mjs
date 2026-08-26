import { c } from '../../lint/lint-report.mjs';

const LINES = [
	`${c.bold}Usage:${c.reset} pnpm i18n:check [options]`,
	'',
	'Checks that every i18n key is declared, translated and used, and paints one',
	'row per scope with the state of its keys, params and languages.',
	'',
	`${c.bold}Options:${c.reset}`,
	`  ${c.cyan}--fix${c.reset}              write what can be written by itself (params files,`,
	'                     missing translation slots, scope registration) and then',
	'                     report whatever is left',
	`  ${c.cyan}--verbose${c.reset}, ${c.cyan}-v${c.reset}      list the non-blocking findings too — warnings and notes`,
	'                     are counted but not printed unless this flag is given',
	`  ${c.cyan}--dir${c.reset} <path>       catalogue directory (default: apps/web/src/app/i18n)`,
	`  ${c.cyan}--source${c.reset} <paths>   comma-separated roots scanned for usages`,
	`  ${c.cyan}--languages${c.reset} <file> file LANGUAGES / DEFAULT_LANGUAGE are read from`,
	`  ${c.cyan}--langs${c.reset} <codes>    comma-separated languages, the first one the source`,
	`  ${c.cyan}--help${c.reset}, ${c.cyan}-h${c.reset}         print this text`,
	'',
	'Only errors fail the command: warnings and notes never change the exit code.',
	'',
	`${c.bold}Examples:${c.reset}`,
	`  ${c.dim}pnpm i18n:check --fix${c.reset}`,
	`  ${c.dim}pnpm i18n:check --verbose --langs es-ES,en-GB${c.reset}`,
];

export const printUsage = () => console.log(LINES.join('\n'));
