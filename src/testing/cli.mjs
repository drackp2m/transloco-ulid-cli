import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../../bin/transloco-ulid.mjs', import.meta.url));
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[A-Za-z]`, 'g');

export const plain = (text) => String(text ?? '').replace(ANSI, '');

export function runCli(root, args, env = {}) {
	const inherited = { ...process.env };

	delete inherited.GITHUB_STEP_SUMMARY;

	const result = spawnSync(process.execPath, [BIN, ...args], {
		cwd: root,
		encoding: 'utf8',
		env: { ...inherited, ...env },
	});

	return { status: result.status, stdout: plain(result.stdout), stderr: plain(result.stderr) };
}
