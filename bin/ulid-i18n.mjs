#!/usr/bin/env node
const COMMANDS = ['check', 'export', 'import', 'state', 'clear'];

const [command] = process.argv.splice(2, 1);

if (!COMMANDS.includes(command)) {
	console.error(`Usage: ulid-i18n <${COMMANDS.join('|')}> [options]`);
	process.exit(1);
}

await import(new URL(`../src/${command}.mjs`, import.meta.url).href);
