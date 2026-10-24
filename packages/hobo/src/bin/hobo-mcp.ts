#!/usr/bin/env node
import { createHoboMcpServer } from "@hobo/mcp";

import { createComposedHoboCli } from "../cli.js";
import {
	relaunchInputFor,
	relaunchMcpUnderOpenSesame,
	reportingCredentialRefusals,
	wantsOpenSesameRelaunch,
} from "../credentials-opensesame.js";
import { localOperatorAuth, serveMcpStdio } from "../mcp-stdio.js";

// The runnable MCP control surface (docs/plans/0006 item 3-3): the composed
// hobo CLI (default LOCAL/MOCKED lane; live lanes stay credential-gated by
// env) exposed over MCP stdio. Every tool call dispatches through the same
// command registry as the `hobo` binary — one surface, two transports.
async function serve(): Promise<number> {
	// Its throwaway event store is the default runtime's own, removed however
	// this process ends.
	const server = createHoboMcpServer({ cli: createComposedHoboCli() });
	await serveMcpStdio({
		server,
		auth: localOperatorAuth(),
		input: process.stdin,
		output: process.stdout,
	});
	return 0;
}

// HOBO_CREDENTIALS=opensesame (ADR-0170): its tools run the same verbs as
// `hobo`, `up` among them, so it relaunches under OpenSesame as `hobo` does,
// stdin and stdout passing through to the relaunched server; it needs
// OPENSESAME_STORE_PASSWORD for that (credentials-opensesame.ts says why). A
// credential refusal when the server is composed is one `hobo:` line and 1.
process.exitCode = wantsOpenSesameRelaunch(process.env)
	? await relaunchMcpUnderOpenSesame(relaunchInputFor(process))
	: await reportingCredentialRefusals(serve);
