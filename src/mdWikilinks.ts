/**
 * markdown-it plugin that renders [[wikilinks]] as clickable links
 * in the Joplin preview pane.
 *
 * Uses custom token types (wikilink_open/close) to avoid interference
 * from Joplin's own link rendering pipeline, while rendering as native
 * <a> elements so the theme determines all styling.
 */

function wikilinkInlineRule(state: any, silent: boolean): boolean {
	const src: string = state.src;
	const pos: number = state.pos;

	// Quick check: must start with `[[`
	if (src.charCodeAt(pos) !== 0x5B || src.charCodeAt(pos + 1) !== 0x5B) {
		return false;
	}

	// Scan for closing `]]`
	const end = src.indexOf(']]', pos + 2);
	if (end < 0) return false;

	const raw = src.slice(pos + 2, end);
	if (!raw) return false;

	if (silent) return true;

	// Parse alias (`|`) and heading (`#`)
	const pipeIdx = raw.indexOf('|');
	const target = pipeIdx >= 0 ? raw.slice(0, pipeIdx) : raw;
	const alias = pipeIdx >= 0 ? raw.slice(pipeIdx + 1) : null;

	// Display text: alias if present, otherwise target without heading
	const hashIdx = target.indexOf('#');
	const displayText = alias
		? alias
		: (hashIdx >= 0 ? target.slice(0, hashIdx) || target.slice(hashIdx + 1) : target);

	// Emit wikilink_open — custom token type but renders as <a>
	const tokenOpen = state.push('wikilink_open', 'a', 1);
	tokenOpen.attrSet('href', '#');
	tokenOpen.attrSet('class', 'wikilink-link');
	tokenOpen.attrSet('data-wikilink-target', target);

	// Emit text
	const tokenText = state.push('text', '', 0);
	tokenText.content = displayText;

	// Emit wikilink_close
	state.push('wikilink_close', 'a', -1);

	state.pos = end + 2;
	return true;
}

export default function (context: { contentScriptId: string }) {
	return {
		plugin: (markdownIt: any) => {
			markdownIt.inline.ruler.push('wikilink', wikilinkInlineRule);
		},
		assets: () => [{ name: 'mdWikilinksAsset.js' }],
	};
}
