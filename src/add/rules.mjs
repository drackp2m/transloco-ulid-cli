import { CATEGORY_ORDER, paramTag, parse } from '../catalogue/message.mjs';
import { requiredCategoriesOf } from '../catalogue/plurals.mjs';
import { messageProblems } from '../check/icu.mjs';

export { strayParamsIn } from '../check/icu.mjs';

export const KEY_NAME = /^[A-Z][A-Z0-9_]*$/;
export const PARAM_NAME = /^[a-zA-Z][a-zA-Z0-9_]*$/;

const FALLBACK_FORMS = ['one', 'other'];

const isBlank = (text) => '' === String(text ?? '').trim();

const listOf = (items) => items.join(', ');

export const formsToAsk = (lang) => requiredCategoriesOf(lang) ?? FALLBACK_FORMS;

export function pluralSource(argument, forms) {
	const branches = CATEGORY_ORDER.filter((category) => forms.has(category)).map(
		(category) => `${category} {${forms.get(category)}}`,
	);

	return `{${argument}, plural, ${branches.join(' ')}}`;
}

export function keyNameProblem(scope, name) {
	if (!KEY_NAME.test(name)) {
		return `${name} is not SCREAMING_SNAKE_CASE`;
	}

	const taken = (scope.keys?.entries ?? []).some((entry) => entry.name === name);

	return taken ? `${scope.name}.${name} already exists` : null;
}

export const paramNameProblem = (name) =>
	PARAM_NAME.test(name) ? null : `${name} is not a valid param name`;

const syntaxProblem = (subject, error) =>
	`${subject} is not valid ICU: ${error.reason ?? error.message}`;

export function textProblems(text, lang, langs = [lang]) {
	if (isBlank(text)) {
		return ['The text is empty'];
	}

	return messageProblems(text, lang, { langs }).map((item) =>
		'icu-syntax' === item.type ? `The text ${item.message}` : item.message,
	);
}

export function formProblem(argument, category, form) {
	const subject = `The "${category}" form`;

	if (isBlank(form)) {
		return `${subject} is empty`;
	}

	try {
		parse(pluralSource(argument, new Map([[category, form]])));

		return null;
	} catch (error) {
		return syntaxProblem(subject, error);
	}
}

export function pluralProblems(argument, forms, lang) {
	const problems = [paramNameProblem(argument)].filter((problem) => null !== problem);
	const required = formsToAsk(lang);
	const missing = required.filter((category) => !forms.has(category));

	for (const [category, form] of forms) {
		const problem = formProblem(argument, category, form);

		if (null !== problem) {
			problems.push(problem);
		}
	}

	if (0 !== missing.length) {
		problems.push(`"${lang}" needs the forms ${listOf(required)}: missing ${listOf(missing)}`);
	}

	return problems;
}

export function strayMessage({ argument, stray }) {
	const verb = 1 === stray.length ? 'is' : 'are';

	return `${listOf(stray.map(paramTag))} ${verb} not the plural param ${paramTag(argument)}: write # for the number`;
}
