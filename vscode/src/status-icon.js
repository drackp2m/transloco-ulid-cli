const vscode = require('vscode');

const RADIUS = 5.5;
const STROKE = 3;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const PALETTES = {
	light: { track: '#cccccc', translated: '#bf8803', fresh: '#388a34' },
	dark: { track: '#4d4d4d', translated: '#cca700', fresh: '#89d185' },
};

const cache = new Map();

const circle = (color, extra = '') =>
	`<circle cx="8" cy="8" r="${RADIUS}" fill="none" stroke="${color}" stroke-width="${STROKE}"${extra}/>`;

function arc(color, share) {
	if (0 >= share) {
		return '';
	}

	const length = (CIRCUMFERENCE * Math.min(share, 1)).toFixed(3);

	return circle(
		color,
		` stroke-dasharray="${length} ${CIRCUMFERENCE.toFixed(3)}" transform="rotate(-90 8 8)"`,
	);
}

function ringSvg(palette, { total, fresh, translated }) {
	const share = (count) => (0 === total ? 0 : count / total);

	return [
		'<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">',
		circle(palette.track),
		arc(palette.translated, share(translated)),
		arc(palette.fresh, share(fresh)),
		'</svg>',
	].join('');
}

const dataUri = (svg) =>
	vscode.Uri.parse(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);

function ringIcon(progress) {
	const id = `${progress.fresh}/${progress.translated}/${progress.total}`;

	if (!cache.has(id)) {
		cache.set(id, {
			light: dataUri(ringSvg(PALETTES.light, progress)),
			dark: dataUri(ringSvg(PALETTES.dark, progress)),
		});
	}

	return cache.get(id);
}

module.exports = { ringIcon, ringSvg };
