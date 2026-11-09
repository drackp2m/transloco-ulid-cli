import { DEFAULT_NOTES_LANG, noteTextsFor } from './note-texts.mjs';

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

export function genderNoteFor(category, lang, notesLang = DEFAULT_NOTES_LANG) {
	const texts = noteTextsFor(notesLang);

	if (!expandsGender(lang)) {
		return texts.collapsed;
	}

	const chosen = texts.genders[category];

	return undefined === chosen ? texts.unspecified : texts.chosen(chosen);
}
