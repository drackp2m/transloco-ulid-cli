import fs from 'node:fs';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const parserOpts = {
	headerPattern: /^(.+?)\s(?<type>\w+): (?<subject>.+)$/u,
	headerCorrespondence: ['emoji', 'type', 'subject'],
};

export default {
	branches: ['main'],
	plugins: [
		[
			'@semantic-release/commit-analyzer',
			{
				preset: 'conventionalcommits',
				releaseRules: [
					{ type: 'feat', release: 'minor' },
					{ type: 'fix', release: 'patch' },
					{ type: 'style', release: 'patch' },
					{ type: 'refactor', release: 'patch' },
					{ type: 'perf', release: 'patch' },
					{ type: 'revert', release: 'patch' },
					{ type: 'BREAKING CHANGE', release: 'major' },
				],
				parserOpts,
			},
		],
		[
			'@semantic-release/release-notes-generator',
			{
				preset: 'conventionalcommits',
				parserOpts,
				commitsSort: ['scope', 'subject'],
				presetConfig: {
					types: [
						{ type: 'feat', section: '✨ Features', hidden: false },
						{ type: 'style', section: '🎨 Styles', hidden: false },
						{ type: 'test', section: '🧪 Tests', hidden: false },
						{ type: 'refactor', section: '♻️ Code Refactoring', hidden: false },
						{ type: 'fix', section: '🐛 Bug Fixes', hidden: false },
						{ type: 'docs', section: '📚 Documentation', hidden: false },
						{ type: 'perf', section: '🚀 Performance Improvements', hidden: false },
						{ type: 'build', section: '🏗️‍ Build System', hidden: false },
						{ type: 'ci', section: '💻 Continuous Integration', hidden: false },
						{ type: 'chore', section: '🎒 Chores', hidden: false },
						{ type: 'revert', section: '⏪ Reverts', hidden: false },
					],
				},
				writerOpts: {
					mainTemplate: fs.readFileSync(
						path.resolve(__dirname, '.github', 'release-notes', 'template.hbs'),
						'utf8',
					),
				},
			},
		],
		'@semantic-release/changelog',
		'@semantic-release/npm',
		[
			'@semantic-release/exec',
			{
				prepareCmd: 'sh scripts/release/extension.sh prepare ${nextRelease.version}',
				publishCmd: 'sh scripts/release/extension.sh publish ${nextRelease.version}',
			},
		],
		[
			'@semantic-release/github',
			{
				assets: [{ path: 'transloco-ulid-i18n.vsix', label: 'VS Code extension' }],
			},
		],
		[
			'@semantic-release/git',
			{
				assets: ['package.json', 'vscode/package.json', 'CHANGELOG.md'],
				message: '🎒 chore(release): v${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
			},
		],
	],
};
