# @drackp2m/transloco-ulid-cli

Keeps a [Transloco](https://jsverse.github.io/transloco/) catalogue keyed by ULIDs consistent, and
moves it to and from translators as XLIFF 2.0.

Each key is a constant whose value is a ULID, so renaming a constant never touches a translation
and a translation never depends on where its text is used. The CLI checks that every key is
declared, translated and used, generates the parameter types, and exports and imports XLIFF files
that carry the context a translator needs.

## Install

```sh
npm install --save-dev @drackp2m/transloco-ulid-cli
```

It needs Node 22 or later, and uses the TypeScript the project already has.

## Configuration

An `i18n.config.json` at the project root. The CLI looks for it from the working directory
upwards, so run it from the root, which is what npm and pnpm scripts do.

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

- `i18nDir`: the catalogue directory.
- `sourceDirs`: where `.ts` and `.html` files are scanned for key usages.
- `languageFile`: a file declaring `LANGUAGES` and `DEFAULT_LANGUAGE` as literals, for example
  `export const LANGUAGES = ['es-ES', 'en-GB'];`. `DEFAULT_LANGUAGE` is the source language.
- `rootScope`: the name of the scope that lives at the top of `i18nDir`.
- `importAlias`: the path alias for `i18nDir` used in the imports `check --fix` writes.
- `xliffPrefix`: the prefix of the XLIFF sub-states the export writes, such as `my-app:outdated`.

Paths are relative to the file.

## Catalogue layout

```text
i18n/
  index.ts          the I18n barrel: one property per scope
  keys.ts           export const CommonI18n = { SAVE: '01KZ…' };
  params.ts         generated: the parameters each key takes
  es-ES.json        { "01KZ…": "Guardar" }
  en-GB.json
  auth/
    keys.ts         export const AuthI18n = { LOG_IN: 'auth.01KZ…' };
    params.ts
    es-ES.json
  context/          optional: notes for the translator
    app.md
    auth.md
    glossary.json
  state/            generated: when each translation was last checked against its source
```

Texts are ICU messages, so plurals and selects travel as such. Usages are found as
`CommonI18n.SAVE` and as `I18n.auth.LOG_IN`.

## Commands

```sh
transloco-ulid check [--fix] [--verbose]
transloco-ulid export [--lang <codes>] [--missing | --stale | --pending] [--blank]
transloco-ulid import [files|directories...] [--dry-run]
transloco-ulid state [--adopt]
transloco-ulid clear --lang <codes>
```

- `check` reports undeclared, untranslated, unused and mismatched keys, and fails only on errors.
  `--fix` writes what it can by itself: empty translation slots, `params.ts`, the freshness state
  and the scopes missing from the barrel.
- `export` writes one bilingual XLIFF 2.0 file per target language, into `translations/` by
  default. Each unit carries its ULID as id, the constant, where it is used, its parameters and
  the matching glossary terms.
- `import` merges translated XLIFF files back, only ever adding: an empty target is skipped and a
  missing unit keeps its value.
- `state` reports which translations are fresh, stale or missing.
- `clear` empties the translations of one or more languages.

Each command takes `--help`.

## License

MIT
