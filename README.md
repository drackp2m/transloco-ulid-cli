# @drackp2m/transloco-ulid-cli

[![npm](https://img.shields.io/npm/v/@drackp2m/transloco-ulid-cli)](https://www.npmjs.com/package/@drackp2m/transloco-ulid-cli)
[![CI](https://github.com/drackp2m/transloco-ulid-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/drackp2m/transloco-ulid-cli/actions/workflows/ci.yml)
[![coverage](https://coveralls.io/repos/github/drackp2m/transloco-ulid-cli/badge.svg?branch=main)](https://coveralls.io/github/drackp2m/transloco-ulid-cli?branch=main)
[![node](https://img.shields.io/node/v/@drackp2m/transloco-ulid-cli)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/@drackp2m/transloco-ulid-cli)](LICENSE)

A command line that keeps a [Transloco](https://jsverse.github.io/transloco/) catalogue keyed by
ULIDs consistent, and moves it to and from translators as XLIFF 2.0 with the context they need.

```ts
// keys.ts: a readable constant, an opaque and permanent key
export const AuthI18n = {
	LOG_IN: 'auth.01KZCMJMZJP7DHE9CDMSHCGZE3',
} as const;
```

```json
{ "01KZCMJMZJP7DHE9CDMSHCGZE3": "Log in" }
```

```html
<button type="submit">{{ I18n.auth.LOG_IN | transloco }}</button>
```

- **Stable keys.** Every text is a constant whose value is a ULID, so renaming the constant, moving
  the text or rewording it never breaks a translation.
- **One check for the whole catalogue.** Missing and stale translations, unused keys, ICU mistakes,
  parameters that differ between languages, and plural forms a language needs but lacks.
- **Generated types.** `params.ts` declares the parameters each key takes, so passing the wrong
  ones is a TypeScript error.
- **Translator round-trips.** XLIFF 2.0 files carry each key's context, glossary terms, usage sites
  and one unit per plural or gender form. Importing them never overwrites what was already there.

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [The catalogue](#the-catalogue)
- [Messages](#messages)
- [Freshness](#freshness)
- [Context for translators](#context-for-translators)
- [Commands](#commands)
- [Running it in CI](#running-it-in-ci)
- [Using it from code](#using-it-from-code)
- [License](#license)

## Install

```sh
npm install --save-dev @drackp2m/transloco-ulid-cli
```

Requires Node 22 or later and TypeScript 5.0 or later, which it takes from your project as a peer
dependency. The command is `transloco-ulid`; most projects wrap it in scripts:

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

The package ships no Angular code. The catalogue it manages is plain TypeScript and JSON that your
application loads through Transloco.

## Quick start

1. Add an [`i18n.config.json`](#configuration) at the project root, and a file that declares your
   languages.
2. Create an empty [catalogue](#the-catalogue): a `{}` file per language, a `keys.ts` and the
   barrel.

   ```ts
   // src/app/i18n/keys.ts
   export const CommonI18n = {} as const;
   ```

   ```ts
   // src/app/i18n/index.ts
   import { CommonI18n } from '@app/i18n/keys';

   export const I18n = {
   	common: CommonI18n,
   } as const;
   ```

3. Add keys:

   ```sh
   transloco-ulid add --name SAVE --text "Save"
   transloco-ulid add --name ITEMS --plural count --one "# item" --other "# items"
   ```

   The first key with parameters creates `params.ts`, and `add` asks you to add its type to
   [`I18nParams`](#the-barrel).

4. Use them in a template: `{{ I18n.common.SAVE | transloco }}`.
5. Check the catalogue, and let the command fix what it can:

   ```sh
   transloco-ulid check --fix
   ```

6. Send the untranslated texts out, and read them back:

   ```sh
   transloco-ulid export --pending
   transloco-ulid import
   ```

## Configuration

The CLI reads `i18n.config.json`, looking for it from the working directory upwards. Paths are
relative to the directory that holds the file, so in a monorepo they can point into a package.

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

| Field          | Required | What it is                                                                       |
| -------------- | -------- | -------------------------------------------------------------------------------- |
| `i18nDir`      | yes      | The catalogue directory.                                                         |
| `sourceDirs`   | yes      | Where `.ts` and `.html` files are scanned for key usages.                        |
| `languageFile` | yes      | The file that declares `LANGUAGES` and `DEFAULT_LANGUAGE`.                       |
| `rootScope`    | yes      | The name of the scope that lives at the top of `i18nDir`.                        |
| `importAlias`  | yes      | The path alias for `i18nDir`, used in the imports `check --fix` writes.          |
| `xliffPrefix`  | yes      | The prefix of the XLIFF sub-states the export writes, such as `my-app:outdated`. |
| `notesLang`    | no       | The language of the notes the export words itself. Defaults to `en`.             |
| `pipe`         | no       | The pipe that translates a key in a template. Defaults to `transloco`.           |

`notesLang` is explained in [The language of the notes](#the-language-of-the-notes), and `pipe`
in [In the application](#in-the-application).

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
`auth`, `OrderHistoryI18n` for `order-history`. Each property is a key in `SCREAMING_SNAKE_CASE`
whose value is a ULID. Keys in the root scope are the bare ULID. Keys in a nested scope carry the
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

The source language holds every text. Every other language holds an entry for every key too, empty
until it is translated. An empty entry is a warning and a missing one is an error; `check --fix`
turns the second into the first.

### Parameters

`params.ts` is generated by `check --fix` and `add`:

```ts
export interface AuthI18nParams {
	'auth.01KZJ895M8N6WQ02RVEABREFTF': {
		length: number;
	};
}
```

A parameter is `number` when a plural branches on it, the union of its cases when a select does,
and `string` otherwise. `gender` is left out; see [Gender](#gender).

The only edit to make by hand is the type of a plain parameter, which the ICU text cannot tell:
change `string` to `number`, as `length` above, and the generator keeps it.

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
`I18nParams` are reported, and you add them by hand. The CLI only reads those two declarations, so
the barrel can hold anything else your application needs, such as typed wrappers around Transloco.

### Usages

A key is used when a `.ts` or `.html` file under `sourceDirs` mentions it as `AuthI18n.LOG_IN` or
as `I18n.auth.LOG_IN`. A mention inside a comment does not count: it is reported as a note, so a
key that only survives in a comment does not pass for a live one.

The opposite case is an error, `unknown-key`: code that asks for `I18n.auth.LOG_OUT` when
`auth/keys.ts` declares no `LOG_OUT`, or for `I18n.billing.TOTAL` when there is no `billing` scope.
A constant is only read as a scope's when that scope exists, so an unrelated `OtherI18n.NAME` of
your own is left alone.

### In the application

The keys are ordinary Transloco keys. A component exposes the barrel, as
`protected readonly I18n = I18n;`, and translates through the `transloco` pipe:

```html
<button type="submit">{{ I18n.auth.LOG_IN | transloco }}</button>
<p>{{ I18n.common.ITEMS | transloco: { count: total } }}</p>
```

Two things have to be set up on the Transloco side:

- ICU messages need
  [`@jsverse/transloco-messageformat`](https://jsverse.gitbook.io/transloco/plugins-and-extensions/messageformat).
- A nested scope is loaded with `provideTranslocoScope('auth')`, and the loader serves
  `<lang>.json` from the catalogue root and `<scope>/<lang>.json` from each scope.

A key interpolated without the pipe renders the key itself, so `check` reports it as an error,
`missing-pipe`, at its line in the template. The pipe counts anywhere before the interpolation
closes, as in `{{ (saving ? I18n.auth.SAVING : I18n.auth.SAVE) | transloco }}`. A key handed to a
binding, `[label]="I18n.auth.LOG_IN"`, is left alone: whatever receives it does the translating.
A project that translates through a pipe of its own names it in `pipe`.

## Messages

Texts are [ICU messages](https://unicode-org.github.io/icu/userguide/format_parse/messages/), and
`check` applies the same rules to every language, the source included.

### Parameters

```text
Hello {name}, you have {total} items in your basket.
```

A translation takes exactly the parameters of its source, each as the same kind of argument. Adding
one, or turning a plural into a plain parameter, is always an error. Leaving one out is an error
too, unless the translation is [stale](#freshness): the source changed after it was translated, and
the stale warning already covers what it still owes.

### Plurals

```text
{count, plural, one {# item} other {# items}}
```

`#` stands for the number the plural branches on. Writing the parameter by name, `{count}`, also
works, and both make `count` a `number` in `params.ts`. The difference shows at runtime, where `#`
is formatted the way the language writes numbers (`10,000` in English, `10.000` in Spanish). A form
that does not use the number at all is fine: `one {An item} other {Some items}`.

A form that names another parameter and never the number, `one {{total} item}`, is valid as well,
and the application prints it as written. It is also what a slip looks like, so `check` warns about
it once, in the source language, as `stray-plural-param`.

Each language needs exactly the forms
[CLDR](https://cldr.unicode.org/index/cldr-spec/plural-rules) gives it, so a translation branches
on its own categories and not on those of the source:

| Language                             | Forms                                        |
| ------------------------------------ | -------------------------------------------- |
| English, Spanish, French, Italian, … | `one`, `other`                               |
| Russian, Polish, Ukrainian, …        | `one`, `few`, `many`, `other`                |
| Arabic                               | `zero`, `one`, `two`, `few`, `many`, `other` |
| Japanese, Chinese, Indonesian, …     | `other`                                      |

Three refinements:

- `other` is always required, even in Russian, where only decimals reach it.
- A form no whole number can reach is accepted but never required. Spanish, French and Italian
  declare `many` only for compact millions (`1 M`).
- An exact match such as `=0` is accepted anywhere.

These are errors:

- A plural that lacks a form its language needs, or branches on one the language does not have.
- A `selectordinal`, which the catalogue does not support.
- A message that expands into more than 16 forms once its plurals and selects are crossed. Split
  the sentence instead. The source is measured in every language of the catalogue, so a sentence
  that is 4 forms in Spanish and 64 in Russian is refused when it is written, not when the Russian
  comes back.

#### Two numbers in one sentence

Each number gets its own plural, and each is written by name, as `{messages, number}`:

```text
You have {messages, plural, one {{messages, number} message} other {{messages, number} messages}} from {friends, plural, one {{friends, number} friend} other {{friends, number} friends}}
```

`{messages, number}` is formatted the way `#` is. `#` itself is an error here, `ambiguous-hash`:
the export sends one unit per combination of forms, and in "You have # messages from # friends"
nothing says which `#` is which, so the import would put both numbers back under one plural.

Two plurals are 4 forms in English or Spanish and 16 in Russian, Polish or Ukrainian. In Arabic
they are 36, past the limit.

### Selects

```text
{status, select, active {Active} paused {Paused} other {Finished}}
```

Every select needs an `other` branch. In `params.ts` the parameter becomes `'active' | 'paused'`.

### Gender

`gender` is a reserved, ambient parameter. The application is expected to pass it to every message,
taken from the user's setting, so it never appears in `params.ts`. Its values are `male`, `female`
and `other`; a branch on anything else is an error, since nothing would ever reach it.

A translation cannot add a select its source does not have. A sentence that has to agree with the
user in some language therefore carries the select in the source too, even when the source forms
read alike:

```text
en-GB  {gender, select, male {You are registered} female {You are registered} other {You are registered}}
es-ES  {gender, select, male {Estás registrado} female {Estás registrada} other {Ya tienes cuenta}}
```

The export sends one unit per value to languages that mark gender, and a single unit to those that
do not, such as Turkish, Indonesian, Vietnamese or Chinese.

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

That fingerprint gives every translation one of four statuses:

| Status      | Meaning                                                                     |
| ----------- | --------------------------------------------------------------------------- |
| **fresh**   | The fingerprint matches today's source.                                     |
| **stale**   | The source changed after the translation was made.                          |
| **missing** | The entry is empty.                                                         |
| **unknown** | There is a translation but no fingerprint, for example one written by hand. |

A stale translation is a warning, and the export sends it again with the old target and an
`outdated` sub-state.

`import` seals what comes back. A unit translated from today's source becomes fresh. A stale one
that comes back untouched stays stale. One whose source changed while it was out is sealed against
the source it was translated from, so it reads as stale.

[`state`](#state) counts each status per language, and `state --adopt` seals translations as they
are today: the whole catalogue, for one that predates the state files, or only the scopes, keys and
languages it is given.

## Context for translators

A translator who only sees "Open" cannot tell a verb from an adjective. The `context/` directory
next to the keys says what each text is, and the export hands it over inside the XLIFF file. All of
it is optional and written in plain Markdown, in whatever language your translators read.

Context accumulates from the general to the specific: the application, the target language, the
scope, a group of keys, the key. A layer with nothing written for it is left out.

### The application and its languages: `context/app.md`

```md
# Acme

Acme is an online furniture shop. The reader is a customer, not a professional, so nothing is
worded as trade jargon.

Tone: direct and informal, no exclamation marks. Button labels are short, imperative and have no
full stop; status and error messages are full sentences.

Rules for every language:

- The ellipsis is the "…" character, never three dots.
- Product names and order references are never translated.

## es-ES

Spanish from Spain, informal "tú". Buttons in the infinitive (`Guardar`, `Cancelar`). Quotes are
«angle quotes». The decimal separator is the comma.

## ru-RU

Russian, formal "вы". Buttons in the infinitive. The currency sign follows the amount, after a
non-breaking space.
```

- The `#` title is for you, and is not sent.
- The text before the first `##` goes to every language.
- A `## <lang>` section goes only to that language, and `## es-ES, ca-ES` to both.

This is where grammar and style belong: register, how buttons are phrased, punctuation, quotes,
number formats.

### Scopes and keys: `context/<scope>.md`

```md
# auth

The two session screens: log in and create an account. Short forms with an introduction on top.

## LOG_IN_INTRO

The paragraph above the log-in form. "Acme" stays as it is.

## PASSWORD, PASSWORD_MIN_LENGTH

The password field and the minimum length it asks for. `{length}` is a number.

## ERROR_*

Messages under the form when the request fails: full sentences with a full stop.
```

- The text before the first `##` describes the whole scope.
- `## KEY` describes one key, by its constant name.
- `## PREFIX_*` describes every key that matches the pattern, ahead of the key's own section.
- `## A, B` gives several keys the same text. Names and patterns mix: `## ERROR_*, RETRY`.

Two mistakes are warnings: a name that matches no key in the scope, so a renamed constant does not
leave its context behind unnoticed, and a heading with nothing under it. Keys that share a text go
in a single heading, not in stacked ones.

#### Keep formatters away from the context files

The context files are data for the CLI, not documentation. Prettier, for one, reads two patterns in
one heading, `## ERROR_*, WARNING_*`, as emphasis between the two `*`, and rewrites it as
`## ERROR__, WARNING__`. Neither name matches a key any more, so those keys reach the translator
without their context, and only the `unknown-context-key` errors give it away. If you use
Prettier, add the directory to `.prettierignore`, as your `i18nDir` followed by `context/*.md`:

```text
src/app/i18n/context/*.md
```

### Vocabulary: `context/glossary.json`

```json
{
	"terms": [
		{
			"term": "basket",
			"group": "purchase",
			"note": "where items wait until they are paid for; never a cart or a bag",
			"translations": {
				"es-ES": "cesta",
				"ru-RU": "корзина"
			}
		},
		{
			"term": "order",
			"group": "purchase",
			"note": "a basket that has been paid for; never a request",
			"translations": {
				"es-ES": "pedido",
				"ru-RU": "заказ"
			}
		}
	],
	"keep": ["Acme", "SKU", "IBAN"]
}
```

| Field          | What it is                                                           |
| -------------- | -------------------------------------------------------------------- |
| `term`         | The word or phrase, as the source language writes it.                |
| `translations` | The word each language has to use for it.                            |
| `note`         | Optional: what it means here, and what it must not be taken for.     |
| `group`        | Optional: a label to keep related terms together.                    |
| `keep`         | Names that are never translated: product names, acronyms, notations. |

A term is found in a text as a whole word, ignoring case and allowing a plural `s` or `es`, so
"orders" brings in "order". When two terms match and one contains the other, only the longer is
kept: "gift card" wins over "card". A term with no translation for a language is a warning.

### What the translator receives

Each scope becomes a `<file>` in the XLIFF document, and each key a `<unit>`. The context travels
as notes:

| Where    | Note          | What it holds                                                          |
| -------- | ------------- | ---------------------------------------------------------------------- |
| `<file>` | `app`         | The introduction of `app.md`.                                          |
| `<file>` | `language`    | The `## <lang>` section of `app.md` for the target language.           |
| `<file>` | `scope`       | The introduction of `<scope>.md`.                                      |
| `<file>` | `glossary`    | The terms the scope uses, with their translation and note, and `keep`. |
| `<unit>` | `key`         | The constant, such as `AuthI18n.LOG_IN`.                               |
| `<unit>` | `param`       | Each parameter with its type.                                          |
| `<unit>` | `usage`       | The files that use the key.                                            |
| `<unit>` | `context`     | The group and key sections of `<scope>.md`.                            |
| `<unit>` | `term`        | The glossary terms this text uses, with their translation.             |
| `<unit>` | `category`    | For one form of a plural or gender select: which one.                  |
| `<unit>` | `examples`    | For a plural form: the numbers that select it in the target language.  |
| `<unit>` | `gender-note` | For a gender form: what the user chose, if anything.                   |
| `<unit>` | `siblings`    | For one form: every form of the source, side by side.                  |
| `<unit>` | `outdated`    | For a stale translation: that the target below is the old one.         |
| `<unit>` | `srcHash`     | The fingerprint of the source, used on import.                         |

### The language of the notes

What comes from your context files travels as you wrote it. A few notes are worded by the CLI
itself: `examples`, `gender-note`, `outdated` and the line of `glossary` that lists `keep`. They
come from an English template the package ships, `src/catalogue/notes.en.json`.

When your context is written in another language, those notes can follow it, so translators, and
any tool that quotes the notes, read one language throughout. Name the language in
`i18n.config.json`:

```json
{
	"notesLang": "es"
}
```

Then let the CLI write `context/notes.es.json`, and translate its values:

```sh
transloco-ulid notes
```

| Key                 | Where the export puts it                                              | Placeholder                                 |
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

Each text is written to stand on its own, the way a translation tool shows a note: what the
application does with that form, and what the translation has to do about it. Your wording replaces
the template's, so a Spanish file can turn the `examples` of a Russian `few` form into
`la aplicación usa esta forma cuando el número es 2, 3, 4, 22, 23…`. Note categories and unit ids
are the same in every language.

The file has to hold every key of the template, with the same placeholders:

- **Errors**: a missing file, a text that is missing or empty, and a placeholder dropped or made
  up. `check` reports them, and `export` refuses to run rather than send a file in two languages.
- **Warnings**: a key the template does not have, and texts still exactly as the template writes
  them. `check` lists the latter in one line, and `export` repeats it before writing.
  `decimalPoint` is exempt, since many languages share the English one.

With `notesLang` left at `en`, `context/notes.en.json` is optional: when present, it rewords the
English template.

When a newer version of the CLI adds a text to the template, `check` reports it as missing.
`transloco-ulid notes` then adds it to your file in English for you to translate, leaving every
other value as it is.

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

Every command takes `--dir <path>` for another catalogue directory and `--languages <file>` for
another language file. `check`, `add`, `export`, `import` and `notes` print their options with
`--help`.

### check

```sh
transloco-ulid check [--fix] [--verbose]
```

Prints one row per scope with the state of its keys, its parameters and each language, and lists
the problems underneath. Only errors fail the command. Warnings and notes are counted, and listed
with `--verbose`.

| Option             | What it does                                                             |
| ------------------ | ------------------------------------------------------------------------ |
| `--fix`            | Fixes what can be fixed automatically, then reports what is left.        |
| `--verbose`, `-v`  | Lists warnings and notes too.                                            |
| `--source <paths>` | Comma-separated directories to scan for usages, instead of `sourceDirs`. |
| `--langs <codes>`  | Comma-separated languages, the first one being the source.               |

Besides the findings marked below, `--fix` rewrites each `<lang>.json` in `keys.ts` order and
keeps the state files in step.

Every finding belongs to a group: `pending` is translation work still to do, `message` is something
wrong inside a text, `structure` is the files of the catalogue, `usage` is how the code refers to
the keys, and `context` is what travels to the translator.

| Finding                      | Group     | Severity | `--fix` | Meaning                                                                   |
| ---------------------------- | --------- | -------- | ------- | ------------------------------------------------------------------------- |
| `missing-translation`        | pending   | error    | ✔       | A language has no entry for a key the source has.                         |
| `empty-translation`          | pending   | warning  |         | The entry is there and empty: waiting for the translator.                 |
| `stale-translation`          | pending   | warning  |         | The source changed after it was translated.                               |
| `param-mismatch`             | message   | error    |         | A translation adds, drops or changes a parameter.                         |
| `icu-syntax`                 | message   | error    |         | The text is not valid ICU.                                                |
| `missing-other`              | message   | error    |         | A plural or select has no `other` branch.                                 |
| `missing-plural-category`    | message   | error    |         | A plural lacks a form the language needs.                                 |
| `unknown-plural-category`    | message   | error    |         | A plural branches on a form the language does not have.                   |
| `unknown-gender-value`       | message   | error    |         | A gender select branches on a value the setting never holds.              |
| `unsupported-argument`       | message   | error    |         | A `selectordinal`.                                                        |
| `too-many-forms`             | message   | error    |         | The message expands into more than 16 forms in some language.             |
| `ambiguous-hash`             | message   | error    |         | `#` under two or more plurals.                                            |
| `stray-plural-param`         | message   | warning  |         | A plural form of the source names another parameter and never its number. |
| `orphan-translation`         | structure | warning  | ✔       | A language has an entry no key declares.                                  |
| `stale-params`               | structure | error    | ✔       | `params.ts` does not match the source texts.                              |
| `missing-params-file`        | structure | error    | ✔       | A scope with parameters has no `params.ts`.                               |
| `unregistered-scope`         | structure | error    | ✔       | A scope is missing from `I18n` in `index.ts`.                             |
| `unregistered-params`        | structure | error    |         | A scope's parameters are missing from `I18nParams`.                       |
| `missing-barrel`             | structure | error    |         | There is no `index.ts`.                                                   |
| `missing-keys-file`          | structure | error    |         | A scope directory has no `keys.ts`.                                       |
| `missing-lang-file`          | structure | error    |         | A scope has no file for a language.                                       |
| `invalid-json`               | structure | error    |         | A translation, state, glossary or notes file does not parse.              |
| `bad-const-name`             | structure | error    |         | `keys.ts` exports a constant not named after its scope.                   |
| `invalid-ulid`               | structure | error    |         | A key's value is not a ULID.                                              |
| `bad-scope-prefix`           | structure | error    |         | A key's value lacks its scope prefix, or has another one.                 |
| `duplicate-ulid`             | structure | error    |         | Two keys share a ULID.                                                    |
| `unused-key`                 | usage     | warning  |         | Nothing references the key.                                               |
| `commented-usage`            | usage     | note     |         | Only a comment references the key.                                        |
| `missing-pipe`               | usage     | error    |         | A template interpolates a key without the translating pipe.               |
| `unknown-key`                | usage     | error    |         | The code refers to a key, or a scope, the catalogue does not have.        |
| `unknown-context-key`        | context   | error    |         | A name in a context heading matches no key.                               |
| `empty-context-section`      | context   | warning  |         | A context heading has no text under it.                                   |
| `glossary-term-missing-lang` | context   | error    |         | A glossary term has no translation for a language.                        |
| `missing-notes-file`         | context   | error    |         | `notesLang` names a language without its notes file.                      |
| `bad-note-text`              | context   | error    |         | A notes text is missing or empty, or changes a placeholder.               |
| `unknown-note-text`          | context   | warning  |         | The notes file has a text the template does not.                          |
| `untranslated-note-text`     | context   | warning  |         | Texts of the notes file are still the English template.                   |

### add

```sh
transloco-ulid add --name <NAME> --text <text> [--scope <name>]
transloco-ulid add --name <NAME> --plural <param> --one <form> --other <form> [--scope <name>]
```

Writes a new ULID into `keys.ts`, the text into the source `<lang>.json` and an empty entry into
every other language.

| Option                                                   | What it does                                                |
| -------------------------------------------------------- | ----------------------------------------------------------- |
| `--name <NAME>`                                          | The constant, in `SCREAMING_SNAKE_CASE`.                    |
| `--scope <name>`                                         | The scope it goes into. Defaults to `rootScope`.            |
| `--text <text>`                                          | The source text, as an ICU message.                         |
| `--plural <param>`                                       | Builds a plural on that parameter from one option per form. |
| `--zero`, `--one`, `--two`, `--few`, `--many`, `--other` | The forms: exactly those the source language needs.         |
| `--dry-run`                                              | Prints what would be written, and writes nothing.           |

The text has to pass the rules `check` applies to the source language, so a new key never starts
out with an error. A Russian source, for instance, asks for four forms:

```sh
transloco-ulid add --name ITEMS --plural count \
  --one "# товар" --few "# товара" --many "# товаров" --other "# товара"
```

A form that names another parameter and never the number, such as `{total} items` under `count`,
is written with a warning. It is usually a typo for `# items`, but `One item from {name}` has the
same shape on purpose, so it is not refused.

`params.ts` takes the new entry only when it was up to date before, so the key is the only change
the command introduces. When the file already had pending changes, it is left alone and the command
says so.

### export

```sh
transloco-ulid export [--lang <codes>] [--scope <names>] [--missing | --stale | --pending] [--blank]
```

Writes one bilingual XLIFF 2.0 file per target language, `translations/<lang>.xlf` by default.

- Each unit's `id` is the key's value.
- Each `{param}` or `{param, number}` travels as an `<originalData>` and `<ph>` pair the translator
  cannot break.
- A plural or gender select travels as one unit per form the target language needs, with ids such
  as `auth.01KZ…#plural:few`.

| Option            | What it does                                                            |
| ----------------- | ----------------------------------------------------------------------- |
| `--lang <codes>`  | Comma-separated target languages. Defaults to every one but the source. |
| `--scope <names>` | Comma-separated scopes. Defaults to all of them.                        |
| `--out <path>`    | The directory the files are written to. Defaults to `translations`.     |
| `--missing`       | Only the keys with no translation yet.                                  |
| `--stale`         | Only the keys translated before the source changed.                     |
| `--pending`       | Both.                                                                   |
| `--blank`         | Sends every selected unit with an empty target and no `outdated` note.  |

Without `--missing`, `--stale` or `--pending`, the whole catalogue is exported. A key always
travels whole: if one of its forms is selected, all of them are sent.

Use `--blank` when nothing in the file should seed a machine translation, or let an old string
pass as a new answer.

### import

```sh
transloco-ulid import [files|directories...] [--dry-run]
```

Reads translated XLIFF files, from `translations/` by default, and merges their targets into the
`<lang>.json` files in `keys.ts` order.

The import only ever adds. A key the file does not carry keeps its value, and a unit that came back
empty is counted and skipped. A key that travelled as one unit per form is put back together into
one ICU message, and only when every form came back and the result parses.

| Option            | What it does                                               |
| ----------------- | ---------------------------------------------------------- |
| `--dry-run`       | Reports what would change, and writes nothing.             |
| `--verbose`, `-v` | Lists the changed and outdated units one by one.           |
| `--all-new`       | Adds every ULID `keys.ts` does not know, without asking.   |
| `--no-new`        | Skips them all instead.                                    |
| `--langs <codes>` | Comma-separated languages, the first one being the source. |

A ULID the catalogue does not know is offered in an interactive picker, and an accepted one is
appended to `keys.ts`. Run `check --fix` afterwards to bring `params.ts` up to date.

Problems in a file are listed under the changes, each with its rule, and never stop the rest of
the file from being merged:

| Problem                | Meaning                                                  |
| ---------------------- | -------------------------------------------------------- |
| `unknown-language`     | The file targets a language the catalogue does not have. |
| `unknown-scope`        | The file carries a scope the catalogue does not have.    |
| `invalid-unit-id`      | The id of a unit is not a ULID.                          |
| `new-key-forms`        | A key the catalogue lacks came split into forms.         |
| `duplicate-unit`       | A unit came back more than once.                         |
| `unexpected-form`      | A unit is not a form its key has in that language.       |
| `incomplete-forms`     | Some forms of a key came back empty.                     |
| `broken-forms`         | The forms of a key do not rebuild into one message.      |
| `placeholder-mismatch` | A translation changes the placeholders of its source.    |

Every problem leaves out what it names (the unit, the key, the scope or the file), with one
exception: a `placeholder-mismatch` is merged anyway, and `check` then reports it as a
`param-mismatch` in the catalogue.

### state

```sh
transloco-ulid state [--adopt [<targets>]]
```

Counts the fresh, stale, missing and unknown translations of each language; see
[Freshness](#freshness).

`--adopt` seals every non-empty translation against today's source, which also clears every stale
one. On its own it covers the whole catalogue, for one that predates the state files. Followed by
a comma-separated list it seals only what the list names:

| Target           | Seals                                     |
| ---------------- | ----------------------------------------- |
| `scope`          | Every translation of the scope.           |
| `scope.lang`     | The scope in one language.                |
| `scope.KEY`      | The key in every target language.         |
| `scope.KEY.lang` | One translation. `KEY` can be its ULID.   |

```sh
transloco-ulid state --adopt auth.LOG_IN.en-GB,dashboard.fr-FR
```

That is the way to say a translation still stands after a change to the source that did not
affect it, or to give a translation written or corrected by hand for good. A target that names
nothing stops the command before it writes.

Two kinds of translation are never sealed, since a seal says the translation is right: an empty
one, and one `check` would report as an error — invalid ICU, a plural form missing, a parameter
added, dropped or used as another kind. A stale translation is forgiven the parameters it has not
caught up with yet; sealing it would end that, so it is judged as a fresh one. They are listed
with the reason, and the command exits with 1 when they were among the targets asked for.

### clear

```sh
transloco-ulid clear --lang <codes> [--scope <names>] [--dry-run] [--unseal]
```

Empties every translation of the given languages, so they read as untranslated again. The entries
stay, with an empty value, and the source language is refused. `--unseal` also drops their
fingerprints from `state/`.

To send a fresh batch out without touching the catalogue, prefer `export --blank`.

### notes

```sh
transloco-ulid notes [--lang <tag>] [--dry-run]
```

Writes `context/notes.<lang>.json` from the English template, for the language of `notesLang` or
the one `--lang` names; see [The language of the notes](#the-language-of-the-notes).

When the file already exists, the command only adds the texts the template has and the file lacks,
in English. It keeps every value already written and never removes one.

## Running it in CI

```yaml
- name: Check the i18n catalogue
  run: npx transloco-ulid check
```

The command fails on errors only. On GitHub Actions it also writes a report into the job summary:
the table of scopes, the problems counted by rule, and how many of them `--fix` could solve.

## Using it from code

The package is also a library. Importing it by name gives you the engine the commands run on, which
is how an editor integration can show what `check` would say without running it.

```js
import { analyse, loadProject } from '@drackp2m/transloco-ulid-cli';

const project = loadProject(process.cwd());
const { findings, tally } = analyse(project);

for (const { severity, type, file, line, message } of findings) {
	console.log(`${severity} ${type} ${file}:${line} ${message}`);
}
```

`loadProject()` returns `i18n.config.json` with every path made absolute, so it works from any
directory. `analyse()` reads the catalogue and the sources once and returns:

| Field       | What it holds                                                                                                                                                                                                                    |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `findings`  | Everything `check` reports. Each finding carries its `type`, `file`, `line` and `col`; the `scope`, `key`, `ulid` and, where there is one, `lang` it is about; and the `group`, `severity`, `fixable` and `meaning` of its rule. |
| `freshness` | One entry per key and target language: `scope`, `ulid`, `name`, `lang` and `status`.                                                                                                                                             |
| `tally`     | Those entries counted per language, as `state` prints them.                                                                                                                                                                      |
| `scopes`    | The scopes as they were read: keys, translations and files.                                                                                                                                                                      |
| `sources`   | What the code refers to: `usages`, `commented`, `bare` and `sites`, each reference with its line and column.                                                                                                                     |
| `params`    | The parameters `params.ts` declares for each key.                                                                                                                                                                                |

Two options are aimed at editor integrations:

```js
const unsaved = new Map([[file, editorText]]);
const next = analyse(project, { texts: unsaved, sources: previous.sources });
```

- `texts` holds files as the editor has them, by absolute path. They are read instead of the disk,
  whatever they are: a translation, `keys.ts`, a template, a context file.
- `sources` hands back what an earlier pass found in the code, so a change to the catalogue alone
  does not scan the sources again.

The rest of the public API:

| Export                                                                                                                                    | What it is for                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `checkText(text, lang, { langs, source })`                                                                                                | Checks one text on its own, and returns each problem with its rule. `source` also runs the checks that only apply to the source language. |
| `usagesIn(text, file, { pipe })`                                                                                                          | The references one text holds, with where each starts and ends, and whether it is commented or bare.                                      |
| `representativeOf(text)`                                                                                                                  | The one form of a message to show in a single line.                                                                                       |
| `RULES`, `ruleOf()`, `severityOf()`, `groupOf()`, `isFixable()`, `typesOf()`                                                              | The table of findings.                                                                                                                    |
| `planKey()`, `keyNameProblem()`, `paramNameProblem()`, `textProblems()`, `formProblem()`, `formDoubt()`, `formsToAsk()`, `pluralSource()` | What `add` does, without writing: the plan of a new key and the rules for its name, its text and each plural form.                        |
| `exportLangs()`, `buildExport()`, `writeExport()`                                                                                         | What `export` does.                                                                                                                       |
| `readXliff()`, `planImport()`, `applyImport()`                                                                                            | What `import` does.                                                                                                                       |
| `planSeal(project, targets)`, `applySeal(project, plan)`                                                                                  | What `state --adopt` does: the seals a list of targets would write, what it refuses and why, and writing them. `project` carries the `scopes` of `analyse()`. |
| `tallyOf()`, `STATUSES`                                                                                                                   | The freshness statuses and their count.                                                                                                   |
| `readLanguages()`, `isUlid()`, `toKebabCase()`, `toPascalCase()`, `CONFIG_FILE`                                                           | Small helpers most integrations end up needing.                                                                                           |
| `API_VERSION`, `CLI_VERSION`                                                                                                              | The version of this contract, and of the package.                                                                                         |

`API_VERSION` is a whole number that only changes when something in this list changes its meaning
or is removed, so an integration can check it once and state plainly which version of the package
it needs. Additions do not change it.

Every file under `src/` can still be imported by path, as
`@drackp2m/transloco-ulid-cli/catalogue/message.mjs`, but none of them is part of that contract:
they are internals, and change freely between versions.

## License

[MIT](LICENSE)
