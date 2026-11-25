#!/bin/sh
set -eu

STEP=$1
VERSION=$2
ROOT=$(pwd)
VSIX="$ROOT/transloco-ulid-i18n.vsix"
VSCE='@vscode/vsce@4.1.1'
OVSX='ovsx@1.4.0'

prepare() {
	node -e "
		const fs = require('node:fs');
		const file = 'vscode/package.json';
		const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
		manifest.version = process.argv[1];
		fs.writeFileSync(file, JSON.stringify(manifest, null, '\t') + '\n');
	" "$VERSION"

	(cd vscode && npx --yes "$VSCE" package --no-dependencies --out "$VSIX")
}

publish() {
	failed=''

	(cd vscode && npx --yes "$VSCE" publish --oidc --skip-duplicate --packagePath "$VSIX") || failed="$failed Marketplace"

	if [ -n "${OVSX_PAT:-}" ]; then
		npx --yes "$OVSX" publish "$VSIX" --skip-duplicate --pat "$OVSX_PAT" || failed="$failed Open-VSX"
	else
		npx --yes "$OVSX" publish "$VSIX" --skip-duplicate --trusted-publishing || failed="$failed Open-VSX"
	fi

	if [ -n "$failed" ]; then
		echo "the extension $VERSION was not published to:$failed" >&2
		exit 1
	fi
}

case "$STEP" in
	prepare) prepare ;;
	publish) publish ;;
	*) echo "usage: extension.sh <prepare|publish> <version>" >&2; exit 1 ;;
esac
