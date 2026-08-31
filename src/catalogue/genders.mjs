export const GENDER_ARG = 'gender';

// The values the gender setting can hold, which are the only ones the application ever
// passes: a branch on anything else is text nothing reaches.
export const GENDER_VALUES = ['male', 'female', 'other'];

const GENDERLESS = new Set(['tr', 'id', 'vi', 'zh']);

const baseOf = (lang) => String(lang).split('-')[0].toLowerCase();

export const isGenderArg = (name) => GENDER_ARG === name;

export const expandsGender = (lang) => !GENDERLESS.has(baseOf(lang));

export function genderCategoriesOf(lang, cases) {
	if (!expandsGender(lang)) {
		return ['other'];
	}

	const known = GENDER_VALUES.filter((key) => cases.includes(key));

	return [...known, ...cases.filter((key) => !GENDER_VALUES.includes(key))];
}

const CHOSEN = { male: 'hombre', female: 'mujer' };

const UNSPECIFIED =
	'quien usa la aplicación no lo ha dicho. No inventes una terminación: reformula la frase para ' +
	'que no haya nada que concordar';

const COLLAPSED =
	'el idioma de destino no marca género, así que ésta es la única forma: escríbela sin ' +
	'concordancia de género';

export function genderNoteFor(category, lang) {
	if (!expandsGender(lang)) {
		return COLLAPSED;
	}

	const chosen = CHOSEN[category];

	return undefined === chosen ? UNSPECIFIED : `quien usa la aplicación ha elegido «${chosen}»`;
}
