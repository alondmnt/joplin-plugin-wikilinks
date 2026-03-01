# [v0.4.1](https://github.com/alondmnt/joplin-plugin-wikilinks/releases/tag/v0.4.1)
*Released on 2026-02-25T00:30:55Z*

## Fixes

- **Search query sanitisation** — strip `"` and `*` from wikilink targets before searching, preventing broken queries for note titles with special characters. The previous approach (backslash escaping) was incorrect for Joplin's filterParser + FTS4 engine.
- **Manifest metadata** — add categories (`editor`, `appearance`) and keywords for plugin repository discoverability.

## Improvements

- **First-word matching during title search** — the zettel ID / first-word check is now performed during the initial search loop, avoiding a redundant paginated API call for single-word targets.
- **Dead link feedback** — clicking a wikilink whose target note doesn't exist now shows an alert instead of failing silently.
- **Cached wikilink ranges** — the click handler reuses ranges already computed by the decoration plugin instead of rescanning.

## Refactors

- Extract `buildWikilinkText` helper for clearer wikilink construction logic.
- Document hardcoded content script ID in preview asset.

---

# [v0.4.0](https://github.com/alondmnt/joplin-plugin-wikilinks/releases/tag/v0.4.0)
*Released on 2026-02-24T09:32:11Z*

## What's new

- **Preview pane links** — `[[wikilinks]]` now render as clickable links in the markdown preview, with full support for aliases and heading anchors.
- **Mobile long-press** — long-press a wikilink in the editor to follow it on mobile devices.

## Fixes

- **Sanitised search queries** — escaped user input in note title searches to prevent query injection.

---

# [v0.3.0](https://github.com/alondmnt/joplin-plugin-wikilinks/releases/tag/v0.3.0)
*Released on 2026-02-24T02:39:01Z*

## What's new

- **Convert Joplin links to wikilinks** — new command to convert `[text](:/noteId)` markdown links to `[[wikilinks]]`. Available via the Note menu, editor toolbar button, or `Ctrl+Shift+L`.
  - Resolves actual note titles via the data API
  - Uses pipe syntax `[[title|text]]` when display text differs from the note title
  - Supports heading anchors: `[text](:/noteId#heading)` → `[[Title#heading]]`
  - First-word / zettel ID matches use the shorter form (e.g. `[[202301]]` instead of `[[202301 Full Title|202301]]`)

---

# [v0.2.0](https://github.com/alondmnt/joplin-plugin-wikilinks/releases/tag/v0.2.0)
*Released on 2026-02-24T00:55:09Z*

## Features

- Support `[[target|alias]]` pipe syntax — alias is styled as link text, target portion is muted, and navigation resolves against the target only.

---

# [v0.1.1](https://github.com/alondmnt/joplin-plugin-wikilinks/releases/tag/v0.1.1)
*Released on 2026-02-24T00:48:06Z*

## Fixes

- Use `title:` prefix for first-word search query, restricting zettel ID matching to title fields only and avoiding unnecessary full-text matches against note bodies.

---

# [v0.1.0](https://github.com/alondmnt/joplin-plugin-wikilinks/releases/tag/v0.1.0)
*Released on 2026-02-24T00:33:41Z*

## What's New

- **Add CM6 wikilink decorations** — `[[…]]` patterns are visually decorated with link colour and dimmed brackets, excluding code blocks
- **Add Ctrl/Cmd+Click navigation with note resolution** — 3-tier resolution: direct note ID, exact/case-insensitive title match, first-word (zettel ID) match; shortest title wins on ambiguity
- **Use native Joplin heading scroll with uslug** — `[[Note#Heading]]` anchors use Joplin's built-in `openNote` hash parameter and `scrollToHash`; compatible with Obsidian/Logseq raw heading text and pre-slugified input; supports same-note `[[#Heading]]` jumps

---
