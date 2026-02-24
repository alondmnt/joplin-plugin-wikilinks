/**
 * Asset script loaded in the preview webview.
 * Delegates clicks on wikilink spans to the plugin message handler.
 */
document.addEventListener('click', function (event) {
	var el = event.target;
	while (el && el !== document.body) {
		if (el.classList && el.classList.contains('wikilink-link')) {
			var target = el.getAttribute('data-wikilink-target');
			if (target) {
				event.stopPropagation();
				event.preventDefault();
				// Content script ID must match MD_CONTENT_SCRIPT_ID in index.ts
				webviewApi.postMessage('md-wikilinks', { name: 'followWikilink', target: target })
					.then(function (result) {
						if (result && result.error === 'not_found') {
							alert('Note not found: "' + result.title + '"');
						}
					});
			}
			return;
		}
		el = el.parentElement;
	}
}, true);
