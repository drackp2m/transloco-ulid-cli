import { randomBytes } from 'node:crypto';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TIME_LENGTH = 10;
const RANDOM_LENGTH = 16;

function encodeTime(time) {
	let result = '';
	let rest = Math.floor(time);

	for (let index = 0; TIME_LENGTH > index; index += 1) {
		result = ALPHABET[rest % ALPHABET.length] + result;
		rest = Math.floor(rest / ALPHABET.length);
	}

	return result;
}

export function newUlid(time = Date.now(), bytes = randomBytes(RANDOM_LENGTH)) {
	const random = [...bytes]
		.slice(0, RANDOM_LENGTH)
		.map((byte) => ALPHABET[byte % ALPHABET.length])
		.join('');

	return encodeTime(time) + random;
}
