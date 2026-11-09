import { readDefaults } from '../catalogue/config.mjs';
import { c } from '../shared/terminal.mjs';

const linesOf = (defaults) => [
	`${c.bold}Usage:${c.reset} transloco-ulid add --name <NAME> --text <text> [options]`,
	`       transloco-ulid add --name <NAME> --plural <param> --one <form> --other <form> [options]`,
	'',
	'Adds a key in the source language: a new ULID in keys.ts, its text in the source',
	'<lang>.json and an empty slot in every other one, which stays a warning until the',
	'translator fills it. params.ts takes the new entry only if it was up to date before,',
	'so the key is the only change it can bring.',
	'',
	`${c.bold}Options:${c.reset}`,
	`  ${c.cyan}--name${c.reset} <NAME>      the constant, in SCREAMING_SNAKE_CASE`,
	`  ${c.cyan}--scope${c.reset} <name>     the scope it goes into (default: ${defaults.rootScope})`,
	`  ${c.cyan}--text${c.reset} <text>      the source text, as an ICU message`,
	`  ${c.cyan}--plural${c.reset} <param>   build a plural on that param from one flag per form:`,
	`                     ${c.cyan}--zero --one --two --few --many --other${c.reset}, the ones the source`,
	'                     language needs and no more; write # for the number',
	`  ${c.cyan}--dry-run${c.reset}          print what would be written and write nothing`,
	`  ${c.cyan}--dir${c.reset} <path>       catalogue directory (default: ${defaults.i18nDir})`,
	`  ${c.cyan}--languages${c.reset} <file> file LANGUAGES / DEFAULT_LANGUAGE are read from`,
	`  ${c.cyan}--help${c.reset}, ${c.cyan}-h${c.reset}         print this text`,
	'',
	'The text must pass the same ICU rules check applies to the source language. A plural',
	'form that never counts but names another param gets a warning, not a refusal.',
	'',
	`${c.bold}Examples:${c.reset}`,
	`  ${c.dim}transloco-ulid add --scope auth --name LOG_IN --text "Entrar"${c.reset}`,
	`  ${c.dim}transloco-ulid add --name CHALLENGES --plural count --one "# reto" --other "# retos"${c.reset}`,
];

export const printAddUsage = () => console.log(linesOf(readDefaults()).join('\n'));
