# @drackp2m/transloco-ulid-cli

[![npm](https://img.shields.io/npm/v/@drackp2m/transloco-ulid-cli)](https://www.npmjs.com/package/@drackp2m/transloco-ulid-cli)
[![CI](https://github.com/drackp2m/transloco-ulid-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/drackp2m/transloco-ulid-cli/actions/workflows/ci.yml)
[![coverage](https://coveralls.io/repos/github/drackp2m/transloco-ulid-cli/badge.svg?branch=main)](https://coveralls.io/github/drackp2m/transloco-ulid-cli?branch=main)
[![node](https://img.shields.io/node/v/@drackp2m/transloco-ulid-cli)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/@drackp2m/transloco-ulid-cli)](LICENSE)

Keeps a [Transloco](https://jsverse.github.io/transloco/) catalogue keyed by ULIDs consistent, and
moves it to and from translators as XLIFF 2.0, with the context they need to get it right.

- **Stable keys.** Every text is a constant whose value is a ULID, so renaming the constant, moving
  the text or rewording it never breaks a translation.
- **One check for the whole catalogue.** Missing and stale translations, unused keys, ICU mistakes,
  parameters that do not match between languages, and plural forms a language needs but lacks.
- **Generated types.** `params.ts` declares the parameters every key takes, so passing the wrong
  ones is a TypeScript error.
- **Translator round-trips.** XLIFF 2.0 files that carry each key's context, glossary terms, usage
  sites and one unit per plural or gender form, and come back without ever overwriting what was
  already there.

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [The catalogue](#the-catalogue)
- [Messages](#messages)
- [Context for translators](#context-for-translators)
- [Freshness](#freshness)
- [Commands](#commands)
- [Running it in CI](#running-it-in-ci)
- [Using the modules](#using-the-modules)
- [License](#license)

## Install

```sh
npm install --save-dev @drackp2m/transloco-ulid-cli
```

It needs Node 22 or later, and uses the TypeScript your project already has (5.0 or later). The
command is `transloco-ulid`; most projects wrap it in scripts:

```json
{
	"scripts": {
		"i18n:check": "transloco-ulid check",
		"i18n:add": "transloco-ulid add",
		"i18n:export": "transloco-ulid export",
		"i18n:import": "transloco-ulid import",
		"i18n:state": "transloco-ulid state"
	}
}
```

The package holds the command line only. It ships no Angular code: the catalogue it manages is
plain TypeScript and JSON that your application loads through Transloco.

## Quick start

1. Add an [`i18n.config.json`](#configuration) at the project root, and a file that declares your
   languages.
2. Create the [catalogue](#the-catalogue) with no keys yet: an empty `{}` per language, a
   `keys.ts` and the barrel.

   ```ts
   // src/app/i18n/keys.ts
   export const CommonI18n = {
   } as const;
   ```

   ```ts
   // src/app/i18n/index.ts
   import { CommonI18n } from '@app/i18n/keys';

   export const I18n = {
   	common: CommonI18n,
   } as const;
   ```

3. Add a key:

   ```sh
   transloco-ulid add --name SAVE --text "Save"
   transloco-ulid add --name CHALLENGES --plural count --one "# challenge" --other "# challenges"
   ```

   The first key with parameters creates `params.ts`, and `add` asks you to add its type to
   [`I18nParams`](#the-barrel).

4. Use it in a template, as `{{ I18n.common.SAVE | transloco }}`.
5. Check the catalogue, and let it write what it can by itself:

   ```sh
   transloco-ulid check --fix
   ```

6. Send the untranslated texts out and read them back:

   ```sh
   transloco-ulid export --pending
   transloco-ulid import
   ```

## Configuration

`i18n.config.json` at the project root. The CLI looks for it from the working directory upwards,
so run it from the root, which is what npm and pnpm scripts do.

```json
{
	"i18nDir": "src/app/i18n",
	"sourceDirs": ["src"],
	"languageFile": "src/app/definition/language.type.ts",
	"rootScope": "common",
	"importAlias": "@app/i18n",
	"xliffPrefix": "my-app"
}
```

| Field          | What it is                                                                       |
| -------------- | -------------------------------------------------------------------------------- |
| `i18nDir`      | The catalogue directory.                                                         |
| `sourceDirs`   | Where `.ts` and `.html` files are scanned for key usages.                        |
| `languageFile` | The file that declares `LANGUAGES` and `DEFAULT_LANGUAGE`.                       |
| `rootScope`    | The name of the scope that lives at the top of `i18nDir`.                        |
| `importAlias`  | The path alias for `i18nDir`, used in the imports `check --fix` writes.          |
| `xliffPrefix`  | The prefix of the XLIFF sub-states the export writes, such as `my-app:outdated`. |
| `notesLang`    | Optional. The language of the notes the export words itself, such as `es`.       |
| `pipe`         | Optional. The pipe that translates a key in a template, `transloco` by default.  |

Every field but `notesLang` and `pipe` is required. `notesLang` defaults to `en`: see
[The language of the notes](#the-language-of-the-notes-contextnoteslangjson). `pipe` only matters
to the templates, see [In the application](#in-the-application). Paths are relative to the project
root, where the file lives, which is also where the commands run from.

The language file declares the languages as single-quoted literals. `DEFAULT_LANGUAGE` is the
source language: the one texts are written in, and the one every other language is translated
from.

```ts
export const LANGUAGES = ['en-GB', 'es-ES', 'ru-RU'] as const;

export const DEFAULT_LANGUAGE = 'en-GB';
```

## The catalogue

```text
src/app/i18n/
├── index.ts          the I18n barrel: one property per scope
├── keys.ts           the root scope: export const CommonI18n = { SAVE: '01KZ…' }
├── params.ts         generated: the parameters each key takes
├── en-GB.json        { "01KZ…": "Save" }
├── es-ES.json        { "01KZ…": "Guardar" }
├── auth/             a nested scope, loaded by Transloco as "auth"
│   ├── keys.ts       export const AuthI18n = { LOG_IN: 'auth.01KZ…' }
│   ├── params.ts
│   ├── en-GB.json
│   └── es-ES.json
├── context/          optional: notes for translators
│   ├── app.md
│   ├── auth.md
│   └── glossary.json
└── state/            generated: what each translation was translated from
    ├── common.json
    └── auth.json
```

### Keys

`keys.ts` exports one constant per scope, named after it: `CommonI18n` for `common`, `AuthI18n` for
`auth`, `MatchHistoryI18n` for `match-history`. Each property is a key in `SCREAMING_SNAKE_CASE`
whose value is a ULID. Keys in the root scope are the bare ULID; keys in a nested scope carry the
scope as a prefix, which is the key Transloco looks up once that scope is loaded.

```ts
export const AuthI18n = {
	LOG_IN: 'auth.01KZCMJMZJP7DHE9CDMSHCGZE3',
	PASSWORD_MIN_LENGTH: 'auth.01KZJ895M8N6WQ02RVEABREFTF',
} as const;
```

### Translations

One JSON file per language and scope, keyed by the ULID alone:

```json
{
	"01KZCMJMZJP7DHE9CDMSHCGZE3": "Log in",
	"01KZJ895M8N6WQ02RVEABREFTF": "At least {length} characters."
}
```

The source language holds every text. The other languages hold an entry for every key too, empty
until it is translated: an empty entry is a warning, a missing one an error, and `check --fix`
turns the second into the first.

### Parameters

`params.ts` is generated by `check --fix` and `add`, and never edited by hand except for one thing:
the type of a plain parameter, which the ICU text cannot tell, is kept when you change it.

```ts
export interface AuthI18nParams {
	'auth.01KZJ895M8N6WQ02RVEABREFTF': {
		length: number;
	};
}
```

A parameter is `string` by default, `number` when a plural branches on it, and the union of its
cases when a select does. `gender` is left out: see [Gender](#gender).

### The barrel

`index.ts` gathers the scopes into one object, so the application can write `I18n.auth.LOG_IN`,
and their parameters into one type:

```ts
import { AuthI18n } from '@app/i18n/auth/keys';
import type { AuthI18nParams } from '@app/i18n/auth/params';
import { CommonI18n } from '@app/i18n/keys';
import type { CommonI18nParams } from '@app/i18n/params';

export const I18n = {
	auth: AuthI18n,
	common: CommonI18n,
} as const;

export type I18nParams = AuthI18nParams & CommonI18nParams;
```

`check --fix` adds a scope missing from `I18n`, with its import. A scope's parameters missing from
`I18nParams` are reported, and added by hand. The barrel can hold anything else your application
needs, such as typed wrappers around Transloco: the CLI only reads those two declarations.

### Usages

A key is used when a `.ts` or `.html` file under `sourceDirs` mentions it as `AuthI18n.LOG_IN` or
as `I18n.auth.LOG_IN`. A mention inside a comment does not count: it is reported as a note, so a
key left only in a comment does not pass for a live one.

### In the application

The keys are ordinary Transloco keys. A component exposes the barrel, as
`protected readonly I18n = I18n;`, and translates through the `transloco` pipe:

```html
<button type="submit">{{ I18n.auth.LOG_IN | transloco }}</button>
<p>{{ I18n.common.CHALLENGES | transloco: { count: total } }}</p>
```

ICU messages need [`@jsverse/transloco-messageformat`](https://jsverse.gitbook.io/transloco/plugins-and-extensions/messageformat).
A nested scope has to be loaded with `provideTranslocoScope('auth')`, and the loader has to serve
`<lang>.json` from the catalogue root and `<scope>/<lang>.json` from each scope.

A key interpolated without the pipe renders the key itself, so `check` reports it as an error,
`missing-pipe`, at its line in the template. The pipe counts anywhere before the interpolation
closes, as in `{{ (saving ? I18n.auth.SAVING : I18n.auth.SAVE) | transloco }}`, and a key handed to
a binding, `[label]="I18n.auth.LOG_IN"`, is left alone: whatever receives it does the translating.
A project with a pipe of its own names it in `pipe`.

## Messages

Texts are [ICU messages](https://unicode-org.github.io/icu/userguide/format_parse/messages/), and
the check applies the same rules to every language, the source one included.

### Parameters

```text
Hello {name}, you have {total} challenges left.
```

A translation has to take exactly the parameters of the source, each as the same kind of argument.
Adding one, or turning a plural into a plain parameter, is always an error. Leaving one out is an
error too, unless the translation is [stale](#freshness): then the source changed after it was
translated, and the stale warning already covers what it still owes.

### Plurals

```text
{count, plural, one {# challenge} other {# challenges}}
```

`#` stands for the number the plural branches on. Writing the parameter by name, `{count}`, also
counts, and both make `count` a `number` in `params.ts`; the difference is at runtime, where `#` is
formatted the way the language writes numbers (`10,000` in English, `10.000` in Spanish). A form that
does not use the number at all is fine: `one {A challenge} other {Some challenges}`.

Each language needs exactly the forms [CLDR](https://cldr.unicode.org/index/cldr-spec/plural-rules)
says it has, so a translation branches on its own categories and not on those of the source:

| Language                               | Forms                                        |
| -------------------------------------- | -------------------------------------------- |
| English, Spanish, French, Italian, …   | `one`, `other`                               |
| Russian, Polish, Ukrainian, …          | `one`, `few`, `many`, `other`                |
| Arabic                                 | `zero`, `one`, `two`, `few`, `many`, `other` |
| Japanese, Chinese, Indonesian, …       | `other`                                      |

Two refinements. A form no whole number can reach is never asked for: Spanish, French or Italian
declare `many` only for compact millions (`1 M`), so it is accepted but not required. `other` is
always required, even in Russian, where only decimals reach it. An exact match such as `=0` is
accepted anywhere.

Missing a form the language needs, or branching on one it does not have, is an error. So is a
`selectordinal`, which the catalogue does not support, and a message that opens into more than 16
forms once its plurals and selects are crossed: split the sentence instead. The source is measured
in every language of the catalogue, so a sentence that is 4 forms in Spanish and 64 in Russian is
refused when it is written, not when the Russian comes back.

#### Two numbers in one sentence

Each number gets its own plural, and each is written by name, as `{messages, number}`:

```text
Tienes {messages, plural, one {{messages, number} mensaje} other {{messages, number} mensajes}} de {friends, plural, one {{friends, number} amigo} other {{friends, number} amigos}}
```

`{messages, number}` is formatted the way `#` is (`10.000` in Spanish). `#` itself is an error
here: the export sends one unit per combination of forms, and in «Tienes # mensajes de # amigos»
nothing says which `#` is which, so the import would put both numbers back under one plural. Two
plurals are 4 forms in Spanish or English and 16 in Russian, Polish or Ukrainian; in Arabic they
are 36, past the limit.

### Selects

```text
{status, select, active {Active} paused {Paused} other {Finished}}
```

Every select needs an `other` branch. In `params.ts` the parameter becomes `'active' | 'paused'`.

### Gender

`gender` is an ambient parameter: the application passes it to every message, from the user's
setting, so it never appears in `params.ts`. Its values are `male`, `female` and `other`, and a
branch on anything else is an error, since nothing would ever reach it.

A translation cannot add a select the source does not have, so a sentence that has to agree with
the user in some language carries the select in the source too, even when its own forms read alike:

```text
en-GB  {gender, select, male {You are registered} female {You are registered} other {You are registered}}
es-ES  {gender, select, male {Estás registrado} female {Estás registrada} other {Ya tienes cuenta}}
```

The export sends one unit per value to languages that mark gender, and a single one to those that
do not (Turkish, Indonesian, Vietnamese, Chinese).

## Context for translators

A translator who only sees "Open" cannot tell a verb from an adjective. The `context/` directory
next to the keys says what each text is, and the export hands it over inside the XLIFF file. All of
it is optional and written in plain Markdown, in whatever language your translators read.

Context accumulates from the general to the specific: the application, the target language, the
scope, a group of keys, the key. A layer with nothing written for it drops out.

### The application and its languages: `context/app.md`

```md
# My App

My App trains chess tactics by repetition. The reader is a club player, so board jargon is never
paraphrased.

Tone: direct and informal, no exclamation marks. Button labels are short, imperative and have no
full stop; status and error messages are full sentences.

Rules for every language:

- The ellipsis is the "…" character, never three dots.
- Chess notation, FEN and PGN are never translated.

## es-ES

Spanish from Spain, informal "tú". Buttons in the infinitive (`Guardar`, `Cancelar`). Quotes are
«angle quotes». The decimal separator is the comma.

## ru-RU

Russian, informal "ты". Buttons in the infinitive. Chess terms are the usual Russian ones — ладья,
конь, слон — never transliterations of the English.
```

The `#` title is for you and is not sent. The text before the first `##` goes to every language;
each `## <lang>` section goes only to that language, and `## es-ES, ca-ES` to both. This is where grammar and style belong:
register, how buttons are phrased, punctuation, quotes, number formats.

### Scopes and keys: `context/<scope>.md`

```md
# auth

The two session screens: log in and create an account. Short forms with an introduction on top.

## LOG_IN_INTRO

Says that the session lives in a cookie and survives a reload. "My App" stays as it is.

## PASSWORD, PASSWORD_MIN_LENGTH

The password field and the minimum length it asks for. `{length}` is a number.

## ERROR_*

Messages under the form when the request fails: full sentences with a full stop.
```

- The text before the first `##` describes the whole scope.
- `## KEY` describes one key, by its constant name.
- `## PREFIX_*` describes every key that matches the pattern, before the key's own section.
- `## A, B` gives several keys the same text, as `PASSWORD` and `PASSWORD_MIN_LENGTH` share one
  above. Names and patterns mix: `## ERROR_*, RETRY`.

A name that matches no key in the scope is a warning, so a renamed constant does not leave its
context behind unnoticed. So is a heading with nothing under it: each heading has its own text,
and keys that share one are listed in a single heading.

### Vocabulary: `context/glossary.json`

```json
{
	"terms": [
		{
			"term": "training",
			"group": "programme",
			"note": "the whole programme: calibration, the fixed set and its cycles. Only one runs at a time",
			"translations": {
				"es-ES": "entrenamiento",
				"ru-RU": "тренировка"
			}
		},
		{
			"term": "cycle",
			"group": "programme",
			"note": "one pass through the whole set; never a round",
			"translations": {
				"es-ES": "ciclo",
				"ru-RU": "цикл"
			}
		}
	],
	"keep": ["My App", "FEN", "PGN"]
}
```

| Field          | What it is                                                                           |
| -------------- | ------------------------------------------------------------------------------------ |
| `term`         | The word or phrase, as the source language writes it.                                |
| `translations` | The word each language has to use for it.                                            |
| `note`         | Optional: what it means here, and what it must not be taken for.                     |
| `group`        | Optional: a label to keep related terms together.                                    |
| `keep`         | Names that are never translated: product names, acronyms, notations.                 |

A term is found in a text as a whole word, ignoring case and allowing a plural `s` or `es`, so
"cycles" brings in "cycle". When two terms match and one contains the other, only the longer is
kept: "quiet move" wins over "move". A term with no translation for a language is a warning in that
language's column.

### What the translator receives

Each scope becomes a `<file>` in the XLIFF document, and each key a `<unit>`. The context travels
as notes:

| Where     | Note             | What it holds                                                          |
| --------- | ---------------- | ---------------------------------------------------------------------- |
| `<file>`  | `app`            | The introduction of `app.md`.                                          |
| `<file>`  | `language`       | The `## <lang>` section of `app.md` for the target language.           |
| `<file>`  | `scope`          | The introduction of `<scope>.md`.                                      |
| `<file>`  | `glossary`       | The terms the scope uses, with their translation and note, and `keep`. |
| `<unit>`  | `key`            | The constant, such as `AuthI18n.LOG_IN`.                               |
| `<unit>`  | `param`          | Each parameter with its type.                                          |
| `<unit>`  | `usage`          | The files that use the key.                                            |
| `<unit>`  | `context`        | The group and key sections of `<scope>.md`.                            |
| `<unit>`  | `term`           | The glossary terms this text uses, with their translation.             |
| `<unit>`  | `category`       | For one form of a plural or gender select: which one.                  |
| `<unit>`  | `examples`       | For a plural form: the numbers that select it in the target language.  |
| `<unit>`  | `gender-note`    | For a gender form: what the user chose, if anything.                   |
| `<unit>`  | `siblings`       | For one form: every form of the source, side by side.                  |
| `<unit>`  | `outdated`       | For a stale translation: that the target below is the old one.         |
| `<unit>`  | `srcHash`        | The fingerprint of the source, used on import.                         |

### The language of the notes: `context/notes.<lang>.json`

What comes from your context files travels as you wrote it. A few notes are worded by the CLI
itself: the numbers of `examples`, the `gender-note`, the `outdated` note and the line of
`glossary` that lists `keep`. They come from an English template the package ships,
`src/catalogue/notes.en.json`.

When the context is written in another language, those notes can follow it, so that whoever
translates reads one language throughout, and a prompt that quotes the notes as they come stays in
one language too. Name the language in `i18n.config.json`:

```json
{
	"notesLang": "es"
}
```

Then let the CLI write the file, next to the rest of the context and named after that language,
and translate its values:

```sh
transloco-ulid notes
```

| Key                 | Where the export puts it                                              | Filled with                                 |
| ------------------- | --------------------------------------------------------------------- | ------------------------------------------- |
| `pluralExactly`     | `examples` of an exact case, like `=0`.                               | `{value}`: its number.                      |
| `pluralNumbers`     | `examples` of a plural form some whole numbers select.                | `{numbers}`: the first of them.             |
| `pluralDecimals`    | `examples` of a form only fractions select, like the Russian `other`. | `{numbers}`: a few of them.                 |
| `decimalPoint`      | The separator those fractions are written with.                       |                                             |
| `genderChosen`      | `gender-note` of the `male` and `female` forms.                       | `{gender}`: `genderMale` or `genderFemale`. |
| `genderMale`        | The word `genderChosen` uses for `male`.                              |                                             |
| `genderFemale`      | The word `genderChosen` uses for `female`.                            |                                             |
| `genderUnspecified` | `gender-note` of the `other` form, for users who chose no gender.     |                                             |
| `genderless`        | `gender-note` of the single form of a language without gender.        |                                             |
| `neverTranslate`    | The last line of `glossary`.                                          | `{terms}`: the `keep` names.                |
| `outdated`          | The `outdated` note of a stale translation.                           |                                             |

The English wording is in the template itself, `src/catalogue/notes.en.json`. Each text is written
to stand on its own, as a translation tool shows a note: what the app does with that form, and what
the translation has to do about it. Whatever the file says goes in its place, so a Spanish file can
turn the `examples` of a Russian `few` form into `la aplicación usa esta forma cuando el número es
2, 3, 4, 22, 23…`. The note categories, the ids and the rest of the file are the same in every
language.

Every key of the template has to be there, with the placeholders it has and no others. A missing
file, a text that is missing or empty, or a placeholder dropped or made up is an error in `check`,
and `export` refuses to run rather than send a file in two languages. Two things are only
warnings: a key the template does not have, and texts still exactly as the template writes them,
which `check` lists in one line (`left to translate: "genderFemale", "genderless" and
"outdated"`) and `export` repeats before it writes. `decimalPoint` is left out of that, since many
languages share the English one. With `notesLang` left at `en`, `context/notes.en.json` is
optional: when it is there, it rewords the English template.

When a newer version of the CLI brings a text the template did not have, `check` reports it as
missing, and `transloco-ulid notes` adds it to the file in English for you to translate, leaving
every other value as it is.

## Freshness

`state/<scope>.json` records, for every translation, a fingerprint of the source text it was
translated from:

```json
{
	"01KZCMJMZJP7DHE9CDMSHCGZE3": {
		"es-ES": "3f9a1c0b7d2e",
		"ru-RU": "3f9a1c0b7d2e"
	}
}
```

When the source text changes, its fingerprint no longer matches and the translation is **stale**:
a warning, and the export sends it again with the old target and an `outdated` sub-state. A
translation is **fresh** when the fingerprint matches, **missing** when it is empty, and
**unknown** when it was written without one, for example by hand.

`import` seals what comes back: a unit translated from today's source becomes fresh. A stale one
that comes back untouched stays stale, and one whose source changed while it was out is sealed
against the source it was translated from, so it reads as stale. `state` counts each status per
language, and `state --adopt` seals every translation as it is today, for a catalogue that predates
the state files.

## Commands

| Command             | What it does                                                       |
| ------------------- | ------------------------------------------------------------------ |
| [`check`](#check)   | Reports everything wrong with the catalogue, and fixes some of it. |
| [`add`](#add)       | Adds a key in the source language.                                 |
| [`export`](#export) | Writes XLIFF 2.0 files for translators.                            |
| [`import`](#import) | Merges translated XLIFF files back.                                |
| [`state`](#state)   | Counts fresh, stale and missing translations.                      |
| [`clear`](#clear)   | Empties the translations of some languages.                        |
| [`notes`](#notes)   | Writes the notes file of a language from the English template.     |

`check`, `add`, `export`, `import` and `notes` print their options with `--help`. Every command takes
`--dir <path>` for another catalogue directory and `--languages <file>` for another language file.

### check

```sh
transloco-ulid check [--fix] [--verbose]
```

Paints one row per scope with the state of its keys, its parameters and each language, and lists
the problems underneath. Only errors fail the command; warnings and notes are counted, and listed
with `--verbose`.

| Option              | What it does                                                         |
| ------------------- | -------------------------------------------------------------------- |
| `--fix`             | Writes what can be written by itself, then reports what is left.     |
| `--verbose`, `-v`   | Lists warnings and notes too.                                        |
| `--source <paths>`  | Comma-separated directories to scan for usages, instead of `sourceDirs`. |
| `--langs <codes>`   | Comma-separated languages, the first one the source.                 |

What it reports:

| Finding                      | Group     | Severity | `--fix` | Meaning                                                      |
| ---------------------------- | --------- | -------- | ------- | ------------------------------------------------------------ |
| `missing-translation`        | pending   | error    | ✔       | A language has no entry for a key the source has.            |
| `empty-translation`          | pending   | warning  |         | The entry is there and empty: waiting for the translator.    |
| `orphan-translation`         | structure | warning  | ✔       | A language has an entry no key declares.                     |
| `stale-translation`          | pending   | warning  |         | The source changed after it was translated.                  |
| `param-mismatch`             | message   | error    |         | A translation adds, drops or changes a parameter.            |
| `icu-syntax`                 | message   | error    |         | The text is not valid ICU.                                   |
| `missing-other`              | message   | error    |         | A plural or select has no `other` branch.                    |
| `missing-plural-category`    | message   | error    |         | A plural lacks a form the language needs.                    |
| `unknown-plural-category`    | message   | error    |         | A plural branches on a form the language does not have.      |
| `unknown-gender-value`       | message   | error    |         | A gender select branches on a value the setting never holds. |
| `unsupported-argument`       | message   | error    |         | A `selectordinal`.                                           |
| `too-many-forms`             | message   | error    |         | The message opens into more than 16 forms in some language.  |
| `ambiguous-hash`             | message   | error    |         | `#` under two or more plurals.                               |
| `stale-params`               | structure | error    | ✔       | `params.ts` does not match the source texts.                 |
| `missing-params-file`        | structure | error    | ✔       | A scope with parameters has no `params.ts`.                  |
| `unregistered-scope`         | structure | error    | ✔       | A scope is missing from `I18n` in `index.ts`.                |
| `unregistered-params`        | structure | error    |         | A scope's parameters are missing from `I18nParams`.          |
| `missing-barrel`             | structure | error    |         | There is no `index.ts`.                                      |
| `missing-keys-file`          | structure | error    |         | A scope directory has no `keys.ts`.                          |
| `missing-lang-file`          | structure | error    |         | A scope has no file for a language.                          |
| `invalid-json`               | structure | error    |         | A translation, state, glossary or notes file does not parse. |
| `bad-const-name`             | structure | error    |         | `keys.ts` exports a constant not named after its scope.      |
| `invalid-ulid`               | structure | error    |         | A key's value is not a ULID.                                 |
| `bad-scope-prefix`           | structure | error    |         | A key's value lacks its scope prefix, or has another one.    |
| `duplicate-ulid`             | structure | error    |         | Two keys share a ULID.                                       |
| `unused-key`                 | usage     | warning  |         | Nothing references the key.                                  |
| `commented-usage`            | usage     | note     |         | Only a comment references the key.                           |
| `missing-pipe`               | usage     | error    |         | A template interpolates a key without the translating pipe.  |
| `unknown-context-key`        | context   | warning  |         | A name in a context heading matches no key.                  |
| `empty-context-section`      | context   | warning  |         | A context heading has no text under it.                      |
| `glossary-term-missing-lang` | context   | warning  |         | A glossary term has no translation for a language.           |
| `missing-notes-file`         | context   | error    |         | `notesLang` names a language without its notes file.         |
| `bad-note-text`              | context   | error    |         | A notes text is missing or empty, or changes a placeholder.  |
| `unknown-note-text`          | context   | warning  |         | The notes file has a text the template does not.             |
| `untranslated-note-text`     | context   | warning  |         | Texts of the notes file are still the English template.      |

The group says what a finding is about: `pending` is translation work still to do, `message` is
something wrong inside a text, `structure` is the files of the catalogue, `usage` is how the code
refers to the keys, and `context` is what travels to the translator.

`--fix` also rewrites each `<lang>.json` in `keys.ts` order and keeps the state files in step.

### add

```sh
transloco-ulid add --name <NAME> --text <text> [--scope <name>]
transloco-ulid add --name <NAME> --plural <param> --one <form> --other <form> [--scope <name>]
```

Writes a new ULID into `keys.ts`, the text into the source `<lang>.json` and an empty entry into
every other one. `params.ts` takes the new entry only when it was up to date before, so the key is
the only change the command can bring; when it already had pending changes, it is left alone and
the command says so.

| Option             | What it does                                                            |
| ------------------ | ----------------------------------------------------------------------- |
| `--name <NAME>`    | The constant, in `SCREAMING_SNAKE_CASE`.                                |
| `--scope <name>`   | The scope it goes into. Defaults to `rootScope`.                        |
| `--text <text>`    | The source text, as an ICU message.                                     |
| `--plural <param>` | Builds a plural on that parameter from one option per form.             |
| `--zero`, `--one`, `--two`, `--few`, `--many`, `--other` | The forms, exactly those the source language needs. |
| `--dry-run`        | Prints what would be written, and writes nothing.                       |

The text has to pass the rules `check` applies to the source language, so a key is never born with
an error. A Russian source asks for four forms:

```sh
transloco-ulid add --name CHALLENGES --plural count \
  --one "# задача" --few "# задачи" --many "# задач" --other "# задачи"
```

A form that names another parameter and never counts, such as `{total} challenges` under `count`,
is written all the same with a warning, since it is usually a typo for `# challenges`, and
`One challenge from {name}` has exactly the same shape on purpose.

### export

```sh
transloco-ulid export [--lang <codes>] [--scope <names>] [--missing | --stale | --pending] [--blank]
```

Writes one bilingual XLIFF 2.0 file per target language, `translations/<lang>.xlf` by default.
Each unit's `id` is the key's value, each `{param}` or `{param, number}` travels as an
`<originalData>` and `<ph>` pair the translator cannot break, and a plural or gender select
travels as one unit per form the target
language needs, with ids such as `auth.01KZ…#plural:few`.

| Option            | What it does                                                             |
| ----------------- | ------------------------------------------------------------------------ |
| `--lang <codes>`  | Comma-separated target languages. Defaults to every one but the source.  |
| `--scope <names>` | Comma-separated scopes. Defaults to all of them.                         |
| `--out <path>`    | The directory the files are written to. Defaults to `translations`.      |
| `--missing`       | Only the keys with no translation yet.                                   |
| `--stale`         | Only the keys translated before the source changed.                      |
| `--pending`       | Both.                                                                    |
| `--blank`         | Every unit with an empty target and no outdated note, so nothing in the file can seed a machine translation. |

Without a selection the whole catalogue travels. A key travels whole: one form short sends all of
its siblings along.

### import

```sh
transloco-ulid import [files|directories...] [--dry-run]
```

Reads translated XLIFF files, from `translations/` by default, and merges their targets into the
`<lang>.json` files in `keys.ts` order. It only ever adds: a key the file does not carry keeps its
value, and a unit that came back empty is counted and skipped. A key that travelled as one unit per
form is put back together into one ICU message, and only when every form came back and parses.

| Option            | What it does                                                         |
| ----------------- | -------------------------------------------------------------------- |
| `--dry-run`       | Reports what would change, and writes nothing.                       |
| `--verbose`, `-v` | Lists the changed and outdated units one by one.                     |
| `--all-new`       | Adds every ULID `keys.ts` does not know, without asking.             |
| `--no-new`        | Skips them all instead.                                              |
| `--langs <codes>` | Comma-separated languages, the first one the source.                 |

A ULID the catalogue does not know is offered in a picker, and an accepted one is appended to
`keys.ts`: run `check --fix` afterwards to bring `params.ts` up to date.

### state

```sh
transloco-ulid state [--adopt]
```

Counts the fresh, stale, missing and unknown translations of each language. `--adopt` seals every
non-empty translation against today's source, which also retires every stale one: use it once, on a
catalogue that predates the state files.

### clear

```sh
transloco-ulid clear --lang <codes> [--scope <names>] [--dry-run] [--unseal]
```

Empties every translation of those languages, so they read as untranslated again. The entries stay,
with an empty value. `--unseal` also drops their fingerprints from `state/`, and the source language
is refused. To send a fresh batch out without touching the catalogue, prefer `export --blank`.

### notes

```sh
transloco-ulid notes [--lang <tag>] [--dry-run]
```

Writes `context/notes.<lang>.json` from the English template, for the language of `notesLang` or
the one `--lang` names: see [The language of the notes](#the-language-of-the-notes-contextnoteslangjson).
When the file is already there, it only adds the texts the template has and the file lacks, in
English, and keeps every value already written. It never removes one.

## Running it in CI

```yaml
- name: Check the i18n catalogue
  run: npx transloco-ulid check
```

The command fails on errors only. On GitHub Actions it also writes a report into the job summary:
the table of scopes, the problems counted by rule, and how many `--fix` could solve.

## Using the modules

Every module is importable by path, which is how editor integrations and other tools reuse the
same rules:

```js
import { loadConfig } from '@drackp2m/transloco-ulid-cli/catalogue/config.mjs';
import { collectUsages, readScopes } from '@drackp2m/transloco-ulid-cli/catalogue/collect.mjs';
import { buildFindings } from '@drackp2m/transloco-ulid-cli/check/rules.mjs';

const config = loadConfig(process.cwd());
const scopes = readScopes(config);
const { usages, commented } = collectUsages(config.sourceDirs);
const findings = buildFindings({ ...config, scopes, usages, commented });
```

| Module                     | What it offers                                                  |
| -------------------------- | --------------------------------------------------------------- |
| `catalogue/config.mjs`     | `loadConfig()`, the configuration and the languages.            |
| `catalogue/collect.mjs`    | `readScopes()`, `collectUsages()`, `parseTranslation()`.        |
| `catalogue/message.mjs`    | ICU parsing: `parse()`, `paramsOf()`, `placeholdersIn()`.       |
| `catalogue/plurals.mjs`    | `requiredCategoriesOf()`, `cardinalCategoriesOf()`.             |
| `catalogue/params.mjs`     | `buildScopeParams()`, the `params.ts` generator.                |
| `check/rules.mjs`          | `buildFindings()`, everything `check` reports.                  |
| `check/findings.mjs`       | `severityOf()` and the fixable types.                           |
| `add/rules.mjs`            | The rules `add` applies to a name, a text or a plural form.     |
| `add/plan.mjs`             | `planKey()`: the files a new key changes, without writing them. |
| `catalogue/note-texts.mjs` | `NOTE_TEXTS`, the English template, and `readNoteTexts()`.      |

While the package is in `0.x`, these modules can change in a minor version: pin it exactly when
you build on them.

## License

MIT
