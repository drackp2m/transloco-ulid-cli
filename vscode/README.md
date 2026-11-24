# Transloco ULID i18n

An i18n-ally-flavoured VS Code extension for Transloco catalogues keyed by ULID, the ones
[`@drackp2m/transloco-ulid-cli`](https://www.npmjs.com/package/@drackp2m/transloco-ulid-cli)
manages. It resolves
`I18n.<scope>.<KEY>` (and `<Scope>I18n.KEY`) through the same chain the CLI uses:
`keys.ts` → NAME → ULID, `<lang>.json` → ULID → text.

It has no dependencies and no build step, and no rule of its own: it imports the
`@drackp2m/transloco-ulid-cli` installed in the workspace by its name and builds on what that
package exports, so the extension and `transloco-ulid check` can never drift. It needs the CLI
0.4.0 or later, checks the `API_VERSION` the package declares and says so when the two do not
match. The workspace needs that package as a devDependency and its
`i18n.config.json` at the root, which is where the catalogue paths, the import alias, the XLIFF
sub-state prefix and the language of the export notes come from.

## Features

- **Inline text** — the `displayLang` translation rendered _in place of_ the key usage: the key
  itself collapses to the text and nothing else does, so a trailing `| i18n` stays where it is and
  a `.ts` and an `.html` usage line up the same way. Put the cursor inside and the real source
  comes back, so it stays editable. An ICU message shows one of its forms, `other` for a plural and
  `male` for a gender select, followed by the forms it picked: `… elementos ‹other›`. The text only
  stands in for what would really be rendered, so what gets swallowed depends on what follows the
  key:

  | Usage                              | Shown as                          |
  | ---------------------------------- | --------------------------------- |
  | `{{ I18n.a.B \| i18n }}`           | `{{ Log out \| i18n }}`           |
  | `[label]="I18n.a.B"`, any `.ts`    | `[label]="Log out"`               |
  | `{{ I18n.a.B }}`                   | `{{ I18n.a.B }}`, errored         |
  | `{{ (x ? I18n.a.B : …) \| i18n }}` | `{{ (x ? I18n.a.B «Log out» … }}` |

  A key handed to a child input or held in TypeScript is a key, not a sentence, so it collapses
  the way it always did. A key sitting bare in an interpolation is the one case that _lies_: it
  renders `a.01KZ…` at runtime, so it is left exactly as written and reported as an error — the
  error is the whole message there, and painting a translation next to it would only dress up a
  usage that does not translate anything. The last row is annotated instead: the pipe applies
  further along the interpolation, so nothing is broken and nothing lines up to be collapsed.

- **Hover** — every language at once, the params the key takes with the types declared in the
  generated `<scope>/params.ts`, and the raw `scope.ULID` value.
- **Go to definition** — `ctrl+click` a key to jump to its line in each `<lang>.json`. The jump to
  `keys.ts` is not listed: TypeScript and the Angular language service already resolve the property
  themselves, and listing it again only put the same line in the peek twice. Which entry the peek
  opens on is VS Code's choice, not the order the targets are handed over in.
- **Navigation inside the i18n files** — the same `ctrl+click` keeps working once you are there, so
  every file of a scope is one hop from the others:

  | File          | Clicking on…                   | Goes to                              |
  | ------------- | ------------------------------ | ------------------------------------ |
  | `keys.ts`     | the name (`LOG_OUT`)           | every `.ts` / `.html` that uses it   |
  | `keys.ts`     | the value (`'scope.ULID'`)     | that ULID in the `displayLang` file  |
  | `params.ts`   | the entry key (`'scope.ULID'`) | that ULID in the `displayLang` file  |
  | `<lang>.json` | the ULID                       | its line in `keys.ts`                |
  | `<lang>.json` | the text                       | the same text in the other languages |

  A single target opens straight away; several open the peek list. The key name also answers
  **Find all references** (`shift+alt+F12`), which is the better view when a key is used in a
  dozen places. The usage scan reads the `sourceDirs` of `i18n.config.json` from disk and overlays the unsaved editors, so
  a key you just typed is already there.

- **Search** — `i18n: Search translation keys`, also the magnifier in the title bar of the status
  view, finds a key by its name (`no moves` finds `NO_MOVES_YET`), by its ULID (four characters are
  enough, and the `scope.` of a `keys.ts` value is ignored) or by its text in any language, ignoring
  case and accents. Each row shows the key with its scope and ULID and, under it, its text in the
  `displayLang` the title names, or the text that matched with its language code before it. Names
  come first, then ULIDs, then texts, the `displayLang` ones ahead of the rest. Choosing a row opens
  where it matched: `keys.ts` on the key for a name or a ULID, that `<lang>.json` on the text for a
  translation.

- **Diagnostics** — everything `transloco-ulid check` reports, and nothing else: the extension has
  no rules of its own. It asks the CLI for one analysis of the whole workspace, `analyse()`, and
  publishes each finding where the CLI places it, with the finding type as the diagnostic code. So
  a stale `params.ts`, a param added to one language and not the other, an orphan ULID or a key
  nobody uses is underlined in the i18n file where it lives, and a key the catalogue does not
  declare (`unknown-key`) or one interpolated without the pipe (`missing-pipe`) is underlined in
  the template or the `.ts` that writes it — all of it in the Problems panel even with no file
  open. The pipe is the `pipe` of `i18n.config.json`.
- **At the usage** — what the catalogue says about a key is shown again on every usage of it in an
  open `.ts` or `.html`: a broken ICU message, a param that does not match, a translation still
  missing or outdated. It is the same finding, pointing back at the line of the file that can fix
  it, and several languages with the same problem are one diagnostic that lists them. Only here
  does a diagnostic name its language, `[en-GB]`: in an i18n file the file name already says it.
- **Dead entries** — a key nobody uses (`unused-key`), or only a comment does (`commented-usage`),
  is one finding, on its line of `keys.ts`. Its entry in every `<lang>.json` and its block in
  `params.ts` are only greyed out, as unused code is: a hint that stays out of the Problems panel and
  links back to the key. So a usage broken by a refactor is one problem to fix, and a key that is
  really dead shows as such in every file that still carries its text. An entry no key declares
  (`orphan-translation`) is the same dead text the other way round: it keeps its warning and is
  greyed out as well.
- **Unsaved editors count** — the analysis reads every dirty editor in place of the file on disk,
  whatever it is: a `<lang>.json`, `keys.ts`, a template, a context file. It runs again a moment
  after you stop typing, walking the sources only when a `.ts` or `.html` changed.
- **Severity** is the CLI's, except that pending translation work (`missing-translation`,
  `empty-translation`, `stale-translation`) is never more than a warning: the commit hook is the
  gate, the editor is where the work is still being done.
- **Status view** — the Transloco ULID icon in the activity bar opens a tree of where the catalogue
  stands. **Languages** has a line per target language, with a ring in place of its icon — green for
  what is up to date, amber for what is translated but outdated or never sealed, grey for the rest —
  and the work left beside it, always as a count: `12 pending` (untranslated plus outdated),
  `3 never sealed` when that is all there is, or `up to date`. The two percentages,
  `60 % up to date · 83 % translated`, rounded down so 100 % means every key, are in the tooltip.
  Under each language come the four states `transloco-ulid state` counts, the ones asking for work
  first (untranslated, outdated, never sealed, up to date), and under each state its keys, with the
  source text next to the name; clicking one opens that language's file on the key, or the source
  language's when the key is not in it yet. A key nothing uses (`unused-key`; one only a comment
  mentions is in use) still has its rows, but under a fifth line, **Unused**, after the four states:
  it counts in none of them, nor in the ring, the pending count or the percentages, which are those
  of what the export sends by default. The tooltip of the language says how many were left aside.
  **Scopes** repeats the same per scope, each scope with the ring of all its target languages, its
  number of keys and the percentages in the tooltip.
  **Source** lists every scope and, under it, every key with its text in the source language;
  clicking one opens that file on the key. A key the CLI has something to say about in the source
  language — an unused key, a broken ICU message, a stray plural parameter — shows the symbol of its
  worst finding (✖, ⚠ or ℹ) before its text and lists them in its tooltip; how many there are of each kind is in **Checks**. A key row, here or under a language, has a context menu: find usages, go to
  `keys.ts`, copy the `I18n.scope.KEY` reference, copy the ULID. An outdated or never sealed
  translation also has **Seal as up to date**, and so do the Outdated and Never sealed lines of a
  language (every row under them) and a scope (all of its outdated and never sealed ones): it is
  `transloco-ulid state --adopt` for exactly those translations, for a source change that did not
  affect them or a translation fixed by hand. More than one asks first, a translation with a broken
  message or mismatched parameters is left out and listed in the output channel, and it needs the
  CLI 0.5.0 or later. **Checks** groups by type what
  `transloco-ulid check` reports besides the pending translations, which are already counted above,
  and each finding opens where it lives. The last line is the CLI version the extension is running,
  and opens `i18n.config.json`. When the catalogue cannot be loaded the view shows the reason and
  buttons to reload, open `i18n.config.json` or show the output channel. The title bar holds filter,
  a toggle that leaves only what is untranslated or outdated (never sealed is not pending: it has a
  translation and nothing says the source moved), search and a button that collapses
  everything while anything is open and opens every branch (and every list of up to 20 rows) once
  all is collapsed; create key, remove unused keys (only while there is one), export, import and
  reload are in its `…` menu. A language with work
  left has an **Export pending** button that writes its untranslated and outdated strings — every
  one of them, whatever the filter shows, and only that scope's when it is under **Scopes**. The
  view refreshes with the findings, the sealed hashes in `state/` included.
- **Filter** — the funnel in the title bar of the view, or Cmd+F (Ctrl+F) with the view
  focused, opens a box that narrows the tree as you type. A key stays when the search above would
  find it — by name, ULID or text in any language — and so does every finding about it, or whose
  message holds the text, so `is empty` leaves only the empty translations. Branches with nothing
  left disappear, the counts and percentages are those of what is left, every branch opens and so
  does every list of up to 20 keys or findings, and the line over the tree repeats the filter with
  what it found. Enter, Escape or clicking elsewhere closes the box and keeps the filter; the clear
  button next to the funnel, or emptying the box, removes it. VS Code's own find in the tree stays on
  Cmd+Opt+F (Ctrl+Alt+F).
- **Completion** — scopes after `I18n.`, keys after `I18n.dashboard.` and while the key is half
  typed, each row showing its `displayLang` text on the right. A key that takes params completes
  with them: picking `PROGRAM_CURRENT_SCANS` inside `{{ I18n.dashboard.| | i18n }}` leaves
  `{{ I18n.dashboard.PROGRAM_CURRENT_SCANS | i18n: { solved: number, total: number, percentage: string } }}`
  with a tabstop on every type — <kbd>tab</kbd> through them replacing each with the real expression,
  and a last one _after_ the `}}`, so the next key is one keystroke away. That last jump happens for
  every key, params or not, whenever the completion can see the whole `| i18n }}` on the line. Inside
  a call to one of `keyFunctions`, such as `translate(I18n.dashboard.|)`, it appends `, { … }` the same way. The types are the ones declared in
  the generated `<scope>/params.ts`.
- **Snippet** — typing `i18n` expands to `{{ I18n.| | i18n }}` in HTML (to `I18n.|` when the cursor
  already is inside an interpolation) and to `I18n.|` in TypeScript. The TypeScript one adds
  `import { I18n } from '<importAlias>';`; the HTML one patches the sibling component instead, adding the
  same import, `protected readonly I18n = I18n;` and `pipeClass`, imported from `pipeImport`, in
  `imports`. It leaves that file
  dirty on purpose, and it never touches `provideI18nScope` — a scoped key still needs it by hand.
- **Create key** — `i18n: Create translation key` is `transloco-ulid add` with a picker in front,
  so the rules and the writing both come from the CLI. It picks a scope, asks for the name and whether the key is plain
  text or a plural. A plural asks for its parameter and for every form the source language needs
  (`one` and `other` in Spanish, four in Russian, `other` alone in Japanese), each one starting from
  the selection, or from the previous form when nothing is selected, then writes the ICU. Each
  form's prompt shows what `#` brings over `{count}`: the number the way the source language writes
  it (`10.000`, `1,5`) instead of raw (`10000`, `1.5`). A text
  that does not pass the rules `check` applies to the source language cannot be accepted, and a
  plural form that never counts with `#` (or `{count}`) but names another parameter gets a warning
  while you type, since `{total} retos` under `count` is usually a typo for `# retos`; Enter still
  accepts it, because `Un reto de {name}` is legitimate. Only the source language is asked for: it
  generates the ULID and writes `keys.ts` plus every `<lang>.json`, the target languages with an
  empty slot that stays a warning until the translator fills it. The scope's `params.ts` takes the
  new key's entry only when it was up to date before; one that already had pending changes is left
  untouched, and the closing message says so, along with any warning above. In an `.html` or `.ts`
  editor the reference lands at the cursor, or replaces the selection, which then seeds the default
  language (without its quotes in TypeScript): `{{ I18n.scope.KEY | i18n }}` in HTML, wiring the
  sibling component up like the snippet does, or `I18n.scope.KEY` in TypeScript, with its `I18n`
  import. In HTML a key that takes parameters comes as `{{ I18n.scope.KEY | i18n: { count: | } }}`,
  with a tab stop on each value; `gender` is left out, since the pipe adds it. The closing message
  offers to open the default language file on the new text.
- **Create scope** — the scope picker ends in `New scope…`: it writes `<name>/keys.ts`, an empty
  `<name>/params.ts` and an empty `<name>/<lang>.json` per language, and registers the scope in
  `i18n/index.ts` twice — the import plus the camelCased property in the `I18n` barrel, which is what
  feeds completion back, and the import plus the member in the `I18nParams` union, which is what
  types the pipe. The component still needs its
  `provideI18nScope('<name>')` by hand, which will only accept the scope once it has its first key.
- **Export / import** — `i18n: Export translations to XLIFF` picks the target languages and what to
  send — everything, everything pending, only what has no target yet or only what is outdated — and
  writes one bilingual **XLIFF 2.0** file per language into `translations/`. Each unit carries the ULID as its `id`, the constant
  (`AuthI18n.USERNAME`), where it is used and the declared param types as notes, and every
  `{{ param }}` as an `<originalData>`/`<ph>` pair, so a translator gets an atomic placeholder chip
  instead of braces they can typo. `i18n: Import translations from XLIFF` reads them back: existing
  keys are merged into the `<lang>.json` files in `keys.ts` order, and units whose ULID is not
  declared yet are offered in a multi-select — the ones you tick are appended to `keys.ts` (named
  from the exported note, or slugged from the source text) with their source written to the default
  language. Placeholders that changed shape in the target are reported without blocking the rest.
  A key nothing uses stays out of the export: the command names the ones it would leave out and
  asks first, **Export them too** or **Leave them out**. Both commands run the same code as
  `transloco-ulid export` / `transloco-ulid import`; the export needs the CLI release that brought
  `--include-unused` to leave anything out, and sends everything with an older one. The picker of
  what to export says how many unused keys it leaves out in its title.
- **Remove unused keys** — `i18n: Remove unused keys…` is `transloco-ulid prune`: it lists the keys
  nothing uses and asks, **Remove all** or **Select…**, a multi-select with every key ticked to
  untick the ones to keep; dismissing it removes nothing. Each removed key loses its line in
  `keys.ts`, every translation, its seals and its `params.ts` entry, the last only when that file
  was in step before. A key only a comment mentions is kept. Besides the `…` menu, it is in the
  context menu of the `unused-key` group of **Checks**, whose count is beside it, and of the
  **Unused** lines under a language. It needs the CLI 0.5.0 or later and every i18n file saved.

## Installing it

Install **Transloco ULID i18n** from the VS Code Marketplace or from Open VSX, depending on your
editor. The workspace also needs the CLI and its configuration:

```sh
npm install --save-dev @drackp2m/transloco-ulid-cli
```

and an `i18n.config.json` at the root; see the
[CLI's README](https://github.com/drackp2m/transloco-ulid-cli#configuration). Without them the
status view says what is missing and the rest stays off.

## Developing it

The extension lives in the `vscode/` folder of the
[transloco-ulid-cli](https://github.com/drackp2m/transloco-ulid-cli) repository, next to the CLI it
imports. To try a change, open a project that uses the CLI and launch an Extension Development Host
with `--extensionDevelopmentPath` pointing at that folder, or link the folder into the extensions
directory and reload the window (**Developer: Reload Window**):

```sh
ln -sfn "$PWD/vscode" ~/.vscode/extensions/drackp2m.transloco-ulid-i18n-dev
```

Inside a devcontainer or a remote, the extension host reads `~/.vscode-server/extensions` instead.
The folder name has to start with `<publisher>.<name>-` or the scanner skips it. Set
`translocoUlidI18n.cliDir` to the repository's `src/` to run it against the CLI in the same
checkout rather than the one the project installed.

## Settings

| Setting                                 | Default              | Meaning                                                                                                                 |
| --------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `translocoUlidI18n.cliDir`              | `''`                 | Folder with the CLI's `api.mjs` (its `src/`); empty uses the `@drackp2m/transloco-ulid-cli` installed in the workspace. |
| `translocoUlidI18n.pipeImport`          | `@jsverse/transloco` | Module `pipeClass` is imported from when a template starts using a key.                                                 |
| `translocoUlidI18n.pipeClass`           | `TranslocoPipe`      | Pipe class added to the component's `imports` when a template starts using a key.                                       |
| `translocoUlidI18n.keyFunctions`        | `['translate']`      | Functions called as `fn(key, params)`, inside which completing a key appends its parameters.                            |
| `translocoUlidI18n.languageFile`        | `''`                 | Where `LANGUAGES` and `DEFAULT_LANGUAGE` are declared; empty uses the `languageFile` of `i18n.config.json`.             |
| `translocoUlidI18n.langs`               | `[]`                 | Languages to resolve; empty uses every language of `LANGUAGES`.                                                         |
| `translocoUlidI18n.displayLang`         | `''`                 | Language shown over the keys; empty uses `DEFAULT_LANGUAGE`.                                                            |
| `translocoUlidI18n.inlineText`          | `true`               | Show the inline translation.                                                                                            |
| `translocoUlidI18n.inlineTextMaxLength` | `60`                 | Where the inline text is ellipsised.                                                                                    |
| `translocoUlidI18n.transferDir`         | `translations`       | Where the XLIFF export lands and the import dialog opens.                                                               |

The language file is the single source of both lists — the same one `transloco-ulid check` reads through
`@drackp2m/transloco-ulid-cli/src/catalogue/config.mjs`. It is parsed on every reload and nothing is guessed: a
file that is not there, a `LANGUAGES` that is empty or holds something that is not a language tag, a
`DEFAULT_LANGUAGE` missing or absent from `LANGUAGES`, a `langs` naming a language the file does not
declare or leaving the source language out, a `displayLang` outside the resolved set — each one stops
the index and says so in the **Transloco ULID i18n** output channel.

VSCode builds the label of each row in its settings UI from the setting id, so they read
`Transloco Ulid I18n: Langs` there however the extension is titled. Only the section header uses
the real name.

It also ships a `configurationDefaults` block turning `editor.suggest.showWords` off for `html` and
`typescript`, so VSCode's word-based guesses (the ones that offered `solved` or `percentage`, scraped
from the transloco params of other open files) stop competing with the real keys. Override it in
`.vscode/settings.json` to get them back.

The index rebuilds itself whenever anything under the i18n directory changes;
`i18n: Reload translation index` forces it.
