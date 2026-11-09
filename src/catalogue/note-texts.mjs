export const DEFAULT_NOTES_LANG = 'en';

const TEXTS = {
	en: {
		exactly: (value) => `used for exactly ${value}`,
		integers: (list) => `used for ${list}`,
		general: 'the general form of the sentence',
		decimals: (list) => `used for the decimals: ${list}`,
		decimalPoint: '.',
		chosen: (gender) => `the person using the app has chosen “${gender}”`,
		genders: { male: 'man', female: 'woman' },
		unspecified:
			'the person using the app has not said. Do not make up an ending: reword the sentence ' +
			'so that nothing has to agree with them',
		collapsed:
			'the target language does not mark gender, so this is the only form: write it without ' +
			'gender agreement',
		keep: (terms) => `Never translate: ${terms}`,
		outdated:
			'the source changed after this was translated — the target below is the old translation',
	},
	es: {
		exactly: (value) => `se usa exactamente con ${value}`,
		integers: (list) => `se usa con ${list}`,
		general: 'es la forma general de la frase',
		decimals: (list) => `se usa con los decimales: ${list}`,
		decimalPoint: ',',
		chosen: (gender) => `quien usa la aplicación ha elegido «${gender}»`,
		genders: { male: 'hombre', female: 'mujer' },
		unspecified:
			'quien usa la aplicación no lo ha dicho. No inventes una terminación: reformula la ' +
			'frase para que no haya nada que concordar',
		collapsed:
			'el idioma de destino no marca género, así que ésta es la única forma: escríbela sin ' +
			'concordancia de género',
		keep: (terms) => `No traducir nunca: ${terms}`,
		outdated:
			'el original cambió después de traducir esto — el destino de abajo es la traducción ' +
			'antigua',
	},
};

export const NOTES_LANGS = Object.keys(TEXTS);

export function noteTextsFor(notesLang = DEFAULT_NOTES_LANG) {
	const texts = TEXTS[notesLang];

	if (undefined === texts) {
		throw new Error(`unknown notes language "${notesLang}" — use one of ${NOTES_LANGS.join(', ')}`);
	}

	return texts;
}
