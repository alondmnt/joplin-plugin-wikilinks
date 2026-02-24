import joplin from 'api';
import { ContentScriptType } from 'api/types';
const uslug = require('@joplin/fork-uslug');

const CONTENT_SCRIPT_ID = 'cm6-wikilinks';

// ────────────────────────────────────────────────
// Note resolution — 3-tier strategy
// ────────────────────────────────────────────────

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
		let caseInsensitiveId: string | null = null;
		let firstWordId: string | null = null;

		while (hasMore) {
			const results = await joplin.data.get(['search'], {
				query: `title:"${title}"`,
				fields: ['id', 'title'],
				page,
			});
			const items = results.items || [];

			for (const n of items) {
				// 2. Exact title match
				if (n.title === title) return n.id;

				// 3. Case-insensitive match (keep first)
				if (!caseInsensitiveId && n.title.toLowerCase() === titleLower) {
					caseInsensitiveId = n.id;
				}
			}

			hasMore = results.has_more;
			page++;
		}

		if (caseInsensitiveId) return caseInsensitiveId;

		// 4. First-word match — broader search
		page = 1;
		hasMore = true;
		while (hasMore) {
			const results = await joplin.data.get(['search'], {
				query: title,
				fields: ['id', 'title'],
				page,
			});
			const items = results.items || [];

			for (const n of items) {
				if (!firstWordId && n.title.toLowerCase().split(' ')[0] === titleLower) {
					firstWordId = n.id;
				}
			}

			hasMore = results.has_more;
			page++;
		}

		if (firstWordId) return firstWordId;
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

async function handleMessage(message: any): Promise<void> {
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
		return;
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

		console.info('[wikilinks] plugin started');
	},
});
