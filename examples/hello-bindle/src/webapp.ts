import { Hono } from "hono";

const page = `<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<title>hello-bindle</title>
	</head>
	<body>
		<h1>hello-bindle</h1>
		<p>This web app is bound to the API. Ask it for a greeting at <code>/hello</code>.</p>
	</body>
</html>
`;

/** The web app: a minimal Hono app that is bound to the API (see bindle.ts). */
export const app = new Hono().get("/", (c) => c.html(page));
