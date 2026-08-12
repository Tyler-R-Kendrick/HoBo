import { reviewBrowserControllerScript } from "./review-browser-controller.js";
import {
	reviewBrowserMarkup,
	reviewBrowserStyles,
	reviewBrowserViewScript,
} from "./review-browser-view.js";

// public-contract: loopback review HTML must ship this CSP; tests pin the tokens.
export const REVIEW_BROWSER_CSP =
	"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

export interface ReviewBrowserHtmlOptions {
	readonly token: string;
	readonly sessionId?: string;
}

export function reviewBrowserHtml(options: ReviewBrowserHtmlOptions): string {
	const config = JSON.stringify({
		token: options.token,
		...(options.sessionId === undefined
			? {}
			: { sessionId: options.sessionId }),
	}).replace(/</gu, "\\u003c");
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<meta name="referrer" content="no-referrer"><title>HoBo Code review</title>
<style>${reviewBrowserStyles()}</style></head>
<body>
${reviewBrowserMarkup()}
<script>const cfg=${config};${reviewBrowserViewScript()}
${reviewBrowserControllerScript()}</script>
</body></html>`;
}
