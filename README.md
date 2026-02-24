# Wikilinks

A [Joplin](https://joplinapp.org/) plugin that adds `[[wikilinks]]` support to the Markdown editor and preview pane.

## Features

- **Syntax highlighting** — `[[targets]]` are styled as links with dotted underlines; brackets are rendered in a muted colour.
- **Ctrl/Cmd+Click navigation** — follow a wikilink in the editor to open the target note. On mobile, long-press to follow.
- **Preview pane links** — wikilinks render as clickable links in the markdown preview.
- **Pipe syntax** — `[[target|alias]]` displays the alias as link text and navigates to the target.
- **Heading anchors** — `[[Note Title#Heading]]` scrolls to the heading after opening the note.
- **Smart title resolution** — notes are matched by:
  1. Direct note ID (32-char hex).
  2. Exact title match (case-sensitive).
  3. Case-insensitive title match (shortest title preferred).
  4. First-word / zettel ID match.
- **Convert Joplin links** — convert `[text](:/noteId)` markdown links to wikilinks via the Note menu, editor toolbar button, or `Ctrl+Shift+L`. Automatically resolves note titles and uses pipe syntax when the display text differs.
- **Code-aware** — wikilinks inside code blocks and inline code are ignored.

## Installation

Search for **Wikilinks** in the Joplin plugin repository (*Settings → Plugins*), or install manually:

1. Download the latest `.jpl` file from the [Releases](https://github.com/alondmnt/joplin-plugin-wikilinks/releases) page.
2. In Joplin, go to *Settings → Plugins → Install from file* and select the `.jpl` file.

## Building from source

```bash
npm install
npm run dist
```

The packaged plugin will be written to `publish/`.

## Licence

[MIT](LICENSE)

> This project is developed with the help of AI assistants.
