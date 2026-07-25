#!/usr/bin/env node
import { createHoboMcpServer } from "@hobo/mcp";

import { createComposedHoboCli } from "../cli.js";
import { localOperatorAuth, serveMcpStdio } from "../mcp-stdio.js";

// The runnable MCP control surface (docs/plans/0005 item 3-3): the composed
// hobo CLI (default LOCAL/MOCKED lane; live lanes stay credential-gated by
// env) exposed over MCP stdio. Every tool call dispatches through the same
// command registry as the `hobo` binary — one surface, two transports.
const server = createHoboMcpServer({ cli: createComposedHoboCli() });
await serveMcpStdio({
	server,
	auth: localOperatorAuth(),
	input: process.stdin,
	output: process.stdout,
});
