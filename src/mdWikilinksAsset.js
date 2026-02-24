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
				webviewApi.postMessage('md-wikilinks', { name: 'followWikilink', target: target });
			}
			return;
		}
		el = el.parentElement;
	}
}, true);
