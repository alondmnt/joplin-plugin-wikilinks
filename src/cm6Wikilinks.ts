import type { ContentScriptContext, MarkdownEditorContentScriptModule } from 'api/types';
import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';

/** Regex matching `[[target]]` — requires at least one char inside. */
const WIKILINK_RE = /\[\[([^\[\]]+)\]\]/g;

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
	/** The raw target string between the brackets. */
	target: string;
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

			results.push({ from: absFrom, to: absTo, target: m[1] });
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
				// `[[` bracket
				b.add(r.from, r.from + 2, bracketDeco);
				// link text
				b.add(r.from + 2, r.to - 2, linkDeco);
				// `]]` bracket
				b.add(r.to - 2, r.to, bracketDeco);
			}

			return b.finish();
		}
	},
	{ decorations: (v) => v.decorations },
);

// ────────────────────────────────────────────────
// Click handler — Ctrl/Cmd+Click to follow
// ────────────────────────────────────────────────

/**
 * Build a click handler that sends `followWikilink` messages via the
 * content script bridge when the user Ctrl/Cmd+clicks a wikilink.
 */
function wikilinkClickHandler(context: ContentScriptContext) {
	return EditorView.domEventHandlers({
		click(event: MouseEvent, view: EditorView) {
			// Require Cmd (Mac) or Ctrl (Win/Linux)
			if (!event.metaKey && !event.ctrlKey) return false;

			const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
			if (pos === null) {
				console.info('[wikilinks] click: posAtCoords returned null');
				return false;
			}

			// Check if the clicked position falls within any wikilink
			const links = findWikilinks(view);
			console.info(`[wikilinks] click at pos=${pos}, found ${links.length} wikilinks`);
			for (const link of links) {
				if (pos >= link.from && pos <= link.to) {
					event.preventDefault();
					console.info(`[wikilinks] following: "${link.target}"`);
					context.postMessage({ name: 'followWikilink', target: link.target });
					return true;
				}
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

		// Register scroll-to-line command for heading navigation
		editorControl.registerCommand('scrollToWikilinkLine', (lineNumber: number) => {
			const editor: EditorView = editorControl.editor;

			if (lineNumber < 1) lineNumber = 1;
			if (lineNumber > editor.state.doc.lines) {
				lineNumber = editor.state.doc.lines;
			}

			const lineInfo = editor.state.doc.line(lineNumber);
			editor.dispatch(
				editor.state.update({
					selection: { anchor: lineInfo.from },
					effects: EditorView.scrollIntoView(lineInfo.from, { y: 'start' }),
				}),
			);
			editor.focus();
		});
	},
});
