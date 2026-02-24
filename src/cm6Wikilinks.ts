import type { ContentScriptContext, MarkdownEditorContentScriptModule } from 'api/types';
import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';

/** Regex matching `[[target]]` — requires at least one char inside. */
const WIKILINK_RE = /\[\[([^\[\]]+)\]\]/g;

/** Regex matching Joplin internal links: `[text](:/noteId)` or `[text](:/noteId#slug)`. */
const JOPLIN_LINK_RE = /\[([^\]]*)\]\(:\/([a-f0-9]{32})(?:#([^)]*))?\)/g;

/** A Joplin-style markdown link parsed from the document. */
interface JoplinLink {
	/** Absolute offset of the opening `[`. */
	from: number;
	/** Absolute offset just past the closing `)`. */
	to: number;
	/** Display text between `[` and `]`. */
	text: string;
	/** 32-char hex note ID. */
	noteId: string;
	/** Optional heading slug after `#`. */
	slug: string | null;
}

/** Syntax tree node types that represent code regions. */
const CODE_NODES = new Set([
	'FencedCode', 'CodeBlock', 'InlineCode', 'CodeText',
]);

/** Mark decoration for the `[[` and `]]` brackets. */
const bracketDeco = Decoration.mark({ class: 'cm-wikilink-bracket' });
/** Mark decoration for the link text between brackets. */
const linkDeco = Decoration.mark({ class: 'cm-wikilink' });

// ────────────────────────────────────────────────
// Wikilink range type
// ────────────────────────────────────────────────

interface WikilinkRange {
	/** Absolute offset of the opening `[[`. */
	from: number;
	/** Absolute offset just past the closing `]]`. */
	to: number;
	/** The navigation target (before `|` if piped). */
	target: string;
	/** Absolute offset where alias text starts (after `|`), if present. */
	aliasStart?: number;
}

// ────────────────────────────────────────────────
// Scanner — find wikilinks in visible ranges only
// ────────────────────────────────────────────────

/**
 * Return true if `pos` falls inside a code node in the syntax tree.
 */
function isInsideCode(view: EditorView, pos: number): boolean {
	let inside = false;
	syntaxTree(view.state).iterate({
		from: pos,
		to: pos,
		enter(node) {
			if (CODE_NODES.has(node.name)) {
				inside = true;
				return false; // stop iterating
			}
		},
	});
	return inside;
}

/**
 * Scan only the visible ranges of the editor for `[[…]]` patterns,
 * skipping any that fall inside code nodes.
 */
function findWikilinks(view: EditorView): WikilinkRange[] {
	const results: WikilinkRange[] = [];

	for (const { from, to } of view.visibleRanges) {
		const text = view.state.sliceDoc(from, to);
		WIKILINK_RE.lastIndex = 0;

		let m: RegExpExecArray | null;
		while ((m = WIKILINK_RE.exec(text)) !== null) {
			const absFrom = from + m.index;
			const absTo = absFrom + m[0].length;

			// Skip wikilinks inside code regions
			if (isInsideCode(view, absFrom)) continue;

			const raw = m[1];
			const pipeIdx = raw.indexOf('|');
			const target = pipeIdx >= 0 ? raw.slice(0, pipeIdx) : raw;
			const aliasStart = pipeIdx >= 0 ? absFrom + 2 + pipeIdx + 1 : undefined;

			results.push({ from: absFrom, to: absTo, target, aliasStart });
		}
	}

	return results;
}

// ────────────────────────────────────────────────
// ViewPlugin — decoration set
// ────────────────────────────────────────────────

const wikilinkPlugin = ViewPlugin.fromClass(
	class {
		decorations;

		constructor(view: EditorView) {
			this.decorations = this.build(view);
		}

		update(u: ViewUpdate) {
			if (u.docChanged || u.viewportChanged) {
				this.decorations = this.build(u.view);
			}
		}

		build(view: EditorView) {
			const ranges = findWikilinks(view);
			const b = new RangeSetBuilder<Decoration>();

			// RangeSetBuilder requires ranges added in document order
			for (const r of ranges) {
				b.add(r.from, r.from + 2, bracketDeco);       // `[[`
				if (r.aliasStart !== undefined) {
					b.add(r.from + 2, r.aliasStart, bracketDeco);  // `target|`
					b.add(r.aliasStart, r.to - 2, linkDeco);      // alias
				} else {
					b.add(r.from + 2, r.to - 2, linkDeco);        // link text
				}
				b.add(r.to - 2, r.to, bracketDeco);           // `]]`
			}

			return b.finish();
		}
	},
	{ decorations: (v) => v.decorations },
);

// ────────────────────────────────────────────────
// Joplin link detection and conversion
// ────────────────────────────────────────────────

/**
 * Find the Joplin link at cursor, or the nearest one on the current line.
 *
 * 1. If cursor is directly inside a link → return it.
 * 2. Otherwise → return the nearest link on the line.
 */
function findJoplinLinkAtCursor(view: EditorView): JoplinLink | null {
	const { head } = view.state.selection.main;
	const line = view.state.doc.lineAt(head);

	JOPLIN_LINK_RE.lastIndex = 0;
	const links: JoplinLink[] = [];
	let m: RegExpExecArray | null;

	while ((m = JOPLIN_LINK_RE.exec(line.text)) !== null) {
		links.push({
			from: line.from + m.index,
			to: line.from + m.index + m[0].length,
			text: m[1],
			noteId: m[2],
			slug: m[3] || null,
		});
	}

	if (links.length === 0) return null;

	// Prefer a link the cursor is inside
	for (const link of links) {
		if (head >= link.from && head <= link.to) return link;
	}

	// Fall back to nearest link on the line
	let nearest = links[0];
	let minDist = Math.min(Math.abs(head - nearest.from), Math.abs(head - nearest.to));
	for (let i = 1; i < links.length; i++) {
		const dist = Math.min(Math.abs(head - links[i].from), Math.abs(head - links[i].to));
		if (dist < minDist) {
			minDist = dist;
			nearest = links[i];
		}
	}
	return nearest;
}

/**
 * Resolve the actual note title and convert a Joplin link to a wikilink.
 *
 * If display text differs from the resolved title, uses pipe syntax
 * `[[target|displayText]]`. Heading slugs are preserved in the target.
 */
async function convertToWikilink(
	view: EditorView,
	link: JoplinLink,
	context: ContentScriptContext,
): Promise<void> {
	// Snapshot original text so we can detect edits during the async gap
	const original = view.state.sliceDoc(link.from, link.to);

	// Resolve actual note title from backend
	let title = link.text;
	try {
		const response = await context.postMessage({
			name: 'resolveTitle',
			noteId: link.noteId,
		});
		if (response?.title) {
			title = response.title;
		}
	} catch {
		// Fall back to display text
	}

	if (!title) return; // nothing useful to insert

	// Bail if the document changed during the async round-trip
	if (view.state.sliceDoc(link.from, link.to) !== original) return;

	// Skip alias when display text matches the title or its first word (zettel ID)
	const needsAlias = link.text
		&& link.text !== title
		&& link.text.toLowerCase() !== title.toLowerCase().split(' ')[0];

	// Build the wikilink target (title + optional heading slug)
	const target = needsAlias
		? (link.slug ? `${title}#${link.slug}` : title)
		: (link.slug ? `${link.text || title}#${link.slug}` : (link.text || title));
	const wikilink = needsAlias
		? `[[${target}|${link.text}]]`
		: `[[${target}]]`;

	view.dispatch({
		changes: { from: link.from, to: link.to, insert: wikilink },
	});
}

// ────────────────────────────────────────────────
// Follow handler — Ctrl/Cmd+Click & long-press
// ────────────────────────────────────────────────

/**
 * If `pos` falls inside a wikilink, follow it and return true.
 */
function followWikilinkAtPos(
	pos: number,
	view: EditorView,
	context: ContentScriptContext,
): boolean {
	const links = findWikilinks(view);
	for (const link of links) {
		if (pos >= link.from && pos <= link.to) {
			console.info(`[wikilinks] following: "${link.target}"`);
			context.postMessage({ name: 'followWikilink', target: link.target });
			return true;
		}
	}
	return false;
}

/**
 * Build event handlers for following wikilinks:
 *  - Desktop: Ctrl/Cmd+Click
 *  - Mobile: long-press (contextmenu triggered by touch)
 */
function wikilinkClickHandler(context: ContentScriptContext) {
	return EditorView.domEventHandlers({
		click(event: MouseEvent, view: EditorView) {
			// Require Cmd (Mac) or Ctrl (Win/Linux)
			if (!event.metaKey && !event.ctrlKey) return false;

			const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
			if (pos === null) return false;

			if (followWikilinkAtPos(pos, view, context)) {
				event.preventDefault();
				return true;
			}
			return false;
		},

		contextmenu(event: MouseEvent, view: EditorView) {
			// Only handle touch-originated long-press; preserve desktop right-click
			if (event.button === 2) return false;

			const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
			if (pos === null) return false;

			if (followWikilinkAtPos(pos, view, context)) {
				event.preventDefault();
				return true;
			}
			return false;
		},
	});
}

// ────────────────────────────────────────────────
// Base theme
// ────────────────────────────────────────────────

const wikilinkTheme = EditorView.baseTheme({
	'.cm-wikilink': {
		color: 'var(--joplin-color-link, #0066cc)',
		textDecoration: 'underline',
		textDecorationStyle: 'dotted',
	},
	'.cm-wikilink-bracket': {
		color: 'var(--joplin-color-faded, #999)',
		fontSize: '0.9em',
	},
});

// ────────────────────────────────────────────────
// Plugin entry
// ────────────────────────────────────────────────

export default (context: ContentScriptContext): MarkdownEditorContentScriptModule => ({
	plugin: (editorControl: any) => {
		if (!editorControl.cm6) return;

		editorControl.addExtension([
			wikilinkPlugin,
			wikilinkClickHandler(context),
			wikilinkTheme,
		]);

		// Command: convert the nearest Joplin link to a wikilink
		editorControl.registerCommand('convertToWikilink', async () => {
			const view = editorControl.editor;
			const link = findJoplinLinkAtCursor(view);
			if (!link) return;
			await convertToWikilink(view, link, context);
		});
	},
});
