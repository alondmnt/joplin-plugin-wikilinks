# Wikilinks

A [Joplin](https://joplinapp.org/) plugin that adds `[[wikilinks]]` support to the Markdown editor (CodeMirror 6).

## Features

- **Syntax highlighting** — `[[targets]]` are styled as links with dotted underlines; brackets are rendered in a muted colour.
- **Ctrl/Cmd+Click navigation** — follow a wikilink to open the target note.
- **Heading anchors** — `[[Note Title#Heading]]` scrolls to the heading after opening the note.
- **Smart title resolution** — notes are matched by:
  1. Direct note ID (32-char hex).
  2. Exact title match (case-sensitive).
  3. Case-insensitive title match (shortest title preferred).
  4. First-word / zettel ID match.
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
