import joplin from 'api';
import { ContentScriptType } from 'api/types';

const CONTENT_SCRIPT_ID = 'cm6-wikilinks';

/** Delay (ms) before scrolling to a heading after opening a note. */
const SCROLL_DELAY_MS = 500;

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
// Heading scroll
// ────────────────────────────────────────────────

/**
 * After navigating to a note, find the target heading and scroll to it.
 * Headings are matched case-insensitively.
 */
async function scrollToHeading(heading: string): Promise<void> {
	const note = await joplin.workspace.selectedNote();
	if (!note?.body) return;

	const headingLower = heading.toLowerCase();
	const lines = note.body.split('\n');

	for (let i = 0; i < lines.length; i++) {
		const m = lines[i].match(/^#{1,6}\s+(.+)$/);
		if (m && m[1].trim().toLowerCase() === headingLower) {
			// Line numbers are 1-based
			await joplin.commands.execute('editor.execCommand', {
				name: 'scrollToWikilinkLine',
				args: [i + 1],
			});
			return;
		}
	}

	console.warn(`[wikilinks] heading not found: "${heading}"`);
}

// ────────────────────────────────────────────────
// Message handler
// ────────────────────────────────────────────────

async function handleMessage(message: any): Promise<void> {
	if (message?.name !== 'followWikilink' || !message.target) return;

	const raw: string = message.target;

	// Split on first `#` for heading anchors
	const hashIdx = raw.indexOf('#');
	const title = hashIdx >= 0 ? raw.slice(0, hashIdx) : raw;
	const heading = hashIdx >= 0 ? raw.slice(hashIdx + 1) : null;

	const noteId = await resolveNoteId(title);
	if (!noteId) {
		console.warn(`[wikilinks] note not found: "${title}"`);
		return;
	}

	await joplin.commands.execute('openNote', noteId);

	if (heading) {
		// Wait for the editor to load the new note
		await new Promise((resolve) => setTimeout(resolve, SCROLL_DELAY_MS));
		await scrollToHeading(heading);
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
