import joplin from 'api';
import { ContentScriptType, MenuItemLocation, ToolbarButtonLocation } from 'api/types';
const uslug = require('@joplin/fork-uslug');

const CONTENT_SCRIPT_ID = 'cm6-wikilinks';
const MD_CONTENT_SCRIPT_ID = 'md-wikilinks';

// ────────────────────────────────────────────────
// Memory management helpers
// ────────────────────────────────────────────────

/** Clear a paginated API response to help GC. */
function clearApiResponse(response: any): void {
	if (!response || typeof response !== 'object') return;
	if (Array.isArray(response.items)) {
		response.items.length = 0;
	}
	delete response.items;
	delete response.has_more;
}

// ────────────────────────────────────────────────
// Note resolution — 3-tier strategy
// ────────────────────────────────────────────────

/**
 * Strip characters that are special in Joplin's search syntax.
 *
 * Joplin's filterParser treats `"` as a quote-state toggle and `*` as a
 * wildcard. Other punctuation is stripped by the FTS4 tokeniser and is
 * harmless. The search is a candidate finder — exact matching happens
 * in the caller.
 */
function sanitiseSearchTitle(s: string): string {
	return s.replace(/["*]/g, '');
}

/**
 * Resolve a wikilink target string to a Joplin note ID.
 *
 * Strategy (mirrors tag-navigator's getNoteId):
 *  1. Direct note ID — if target looks like a 32-char hex ID, verify it.
 *  2. Exact title match — case-sensitive.
 *  3. Case-insensitive title match.
 *  4. First-word (zettel ID) match — first word of title equals the target.
 */
async function resolveNoteId(title: string): Promise<string | null> {
	// 1. Direct note ID
	if (/^[a-f0-9]{32}$/.test(title)) {
		try {
			const note = await joplin.data.get(['notes', title], { fields: ['id'] });
			if (note?.id) return note.id;
		} catch {
			// not found — fall through
		}
	}

	// 2 & 3. Title search — exact then case-insensitive
	try {
		let page = 1;
		let hasMore = true;
		const titleLower = title.toLowerCase();
		const safeTitle = sanitiseSearchTitle(title);
		let caseInsensitiveMatch: { id: string; len: number } | null = null;
		let firstWordMatch: { id: string; len: number } | null = null;

		while (hasMore) {
			const results = await joplin.data.get(['search'], {
				query: `title:"${safeTitle}"`,
				fields: ['id', 'title'],
				page,
			});
			const items = results.items || [];
			let exactId: string | null = null;

			for (const n of items) {
				// 2. Exact title match
				if (n.title === title) { exactId = n.id; break; }

				const nLower = n.title.toLowerCase();

				// 3. Case-insensitive match — prefer shortest title
				if (nLower === titleLower) {
					if (!caseInsensitiveMatch || n.title.length < caseInsensitiveMatch.len) {
						caseInsensitiveMatch = { id: n.id, len: n.title.length };
					}
				}

				// 4. First-word (zettel ID) match — prefer shortest title
				if (nLower.split(' ')[0] === titleLower) {
					if (!firstWordMatch || n.title.length < firstWordMatch.len) {
						firstWordMatch = { id: n.id, len: n.title.length };
					}
				}
			}

			hasMore = results.has_more;
			page++;
			clearApiResponse(results);

			if (exactId) return exactId;
		}

		if (caseInsensitiveMatch) return caseInsensitiveMatch.id;

		// For single-word targets, the quoted search already returns all
		// candidates needed for first-word matching. For multi-word targets
		// (where first-word can't match anyway), this fallback uses an
		// unquoted query that searches each word as an independent token.
		if (!firstWordMatch) {
			page = 1;
			hasMore = true;
			while (hasMore) {
				const results = await joplin.data.get(['search'], {
					query: `title:${safeTitle}`,
					fields: ['id', 'title'],
					page,
				});
				const items = results.items || [];

				for (const n of items) {
					if (n.title.toLowerCase().split(' ')[0] === titleLower) {
						if (!firstWordMatch || n.title.length < firstWordMatch.len) {
							firstWordMatch = { id: n.id, len: n.title.length };
						}
					}
				}

				hasMore = results.has_more;
				page++;
				clearApiResponse(results);
			}
		}

		if (firstWordMatch) return firstWordMatch.id;
	} catch (err) {
		console.warn('[wikilinks] resolveNoteId error:', err);
	}

	return null;
}

// ────────────────────────────────────────────────
// Message handler
// ────────────────────────────────────────────────

/**
 * Convert raw heading text (Obsidian-style) to a Joplin-compatible slug.
 * Uses the same algorithm Joplin uses internally for anchor IDs.
 * Accepts both raw text ("My Heading") and pre-slugified ("my-heading").
 */
function headingToSlug(heading: string): string {
	return uslug(heading);
}

async function handleMessage(message: any): Promise<any> {
	// Resolve a note title by ID (used by the convert-to-wikilink command)
	if (message?.name === 'resolveTitle' && message.noteId) {
		try {
			const note = await joplin.data.get(['notes', message.noteId], { fields: ['title'] });
			return { title: note?.title || null };
		} catch {
			return { title: null };
		}
	}

	if (message?.name !== 'followWikilink' || !message.target) return;

	const raw: string = message.target;

	// Split on first `#` for heading anchors
	const hashIdx = raw.indexOf('#');
	const title = hashIdx >= 0 ? raw.slice(0, hashIdx) : raw;
	const heading = hashIdx >= 0 ? raw.slice(hashIdx + 1) : null;
	const slug = heading ? headingToSlug(heading) : null;

	// Same-note heading jump: no title before `#`
	if (!title && slug) {
		await joplin.commands.execute('scrollToHash', slug);
		return;
	}

	const noteId = await resolveNoteId(title);
	if (!noteId) {
		console.warn(`[wikilinks] note not found: "${title}"`);
		return { error: 'not_found', title };
	}

	if (slug) {
		// openNote accepts hash as second arg — Joplin handles the scroll
		await joplin.commands.execute('openNote', noteId, slug);
	} else {
		await joplin.commands.execute('openNote', noteId);
	}
}

// ────────────────────────────────────────────────
// Plugin registration
// ────────────────────────────────────────────────

joplin.plugins.register({
	onStart: async function () {
		await joplin.contentScripts.register(
			ContentScriptType.CodeMirrorPlugin,
			CONTENT_SCRIPT_ID,
			'./cm6Wikilinks.js',
		);

		await joplin.contentScripts.onMessage(CONTENT_SCRIPT_ID, handleMessage);

		// Preview pane: render [[wikilinks]] as clickable links
		await joplin.contentScripts.register(
			ContentScriptType.MarkdownItPlugin,
			MD_CONTENT_SCRIPT_ID,
			'./mdWikilinks.js',
		);
		await joplin.contentScripts.onMessage(MD_CONTENT_SCRIPT_ID, handleMessage);

		// Command: convert a Joplin markdown link to a wikilink
		await joplin.commands.register({
			name: 'wikilinks.convertLink',
			label: 'Convert Joplin link to wikilink',
			iconName: 'fas fa-exchange-alt',
			execute: async () => {
				await joplin.commands.execute('editor.execCommand', {
					name: 'convertToWikilink',
				});
			},
		});

		await joplin.views.menuItems.create(
			'wikilinks-convert-link-menu',
			'wikilinks.convertLink',
			MenuItemLocation.Note,
			{ accelerator: 'Ctrl+Shift+L' },
		);

		await joplin.views.toolbarButtons.create(
			'wikilinks-convert-link-toolbar',
			'wikilinks.convertLink',
			ToolbarButtonLocation.EditorToolbar,
		);

		console.info('[wikilinks] plugin started');
	},
});
