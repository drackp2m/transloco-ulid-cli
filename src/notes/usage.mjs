import { readDefaults } from '../catalogue/config.mjs';
import { c } from '../shared/terminal.mjs';

const linesOf = (defaults) => [
	`${c.bold}Usage:${c.reset} transloco-ulid notes [options]`,
	'',
	'Writes context/notes.<lang>.json from the English template, ready to translate: the',
	'wording of the notes the export adds by itself. When the file is already there, it',
	'only adds the texts a newer template brought, in English, and leaves every one you',
	'translated as it is. check lists what is still left to translate.',
	'',
	`${c.bold}Options:${c.reset}`,
	`  ${c.cyan}--lang${c.reset} <tag>       the language of the file`,
	`                     (default: notesLang, now ${defaults.notesLang})`,
	`  ${c.cyan}--dry-run${c.reset}          print what would be written and write nothing`,
	`  ${c.cyan}--dir${c.reset} <path>       catalogue directory (default: ${defaults.i18nDir})`,
	`  ${c.cyan}--help${c.reset}, ${c.cyan}-h${c.reset}         print this text`,
	'',
	`${c.bold}Examples:${c.reset}`,
	`  ${c.dim}transloco-ulid notes${c.reset}`,
	`  ${c.dim}transloco-ulid notes --lang fr --dry-run${c.reset}`,
];

export const printNotesUsage = () => console.log(linesOf(readDefaults()).join('\n'));
