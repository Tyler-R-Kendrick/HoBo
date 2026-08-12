import { Hono } from "hono";

export const app = new Hono().get("/", (c) =>
	c.html(`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>barebones</title></head>
  <body>
    <h1 data-testid="app-title">barebones</h1>
  </body>
</html>`),
);
