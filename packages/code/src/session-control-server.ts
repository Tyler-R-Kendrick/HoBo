import { randomBytes, timingSafeEqual } from "node:crypto";
import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";

import {
	createLocalSessionControl,
	type LocalSessionControl,
} from "./local-session-control.js";
import { sessionSnapshotJson } from "./session-contract.js";

export interface SessionControlServerOptions {
	readonly hoboHome: string;
	readonly projectRoot: string;
	readonly port?: number;
	readonly token?: string;
	readonly control?: LocalSessionControl;
}

export interface SessionControlServer {
	readonly port: number;
	readonly token: string;
	readonly url: string;
	close(): Promise<void>;
}

function authorized(request: IncomingMessage, token: string): boolean {
	const actual = request.headers.authorization?.replace(/^Bearer /u, "") ?? "";
	const left = Buffer.from(actual);
	const right = Buffer.from(token);
	return left.length === right.length && timingSafeEqual(left, right);
}

function json(response: ServerResponse, status: number, body: unknown): void {
	response.writeHead(status, {
		"cache-control": "no-store",
		"content-type": "application/json; charset=utf-8",
		"x-content-type-options": "nosniff",
	});
	response.end(
		JSON.stringify(body, (_key, value) =>
			typeof value === "bigint" ? value.toString() : value,
		),
	);
}

async function requestBody(request: IncomingMessage): Promise<unknown> {
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of request) {
		const bytes = Buffer.from(chunk);
		size += bytes.length;
		if (size > 1_048_576) throw new Error("request body exceeds 1 MiB");
		chunks.push(bytes);
	}
	return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function browserHtml(token: string, projectRoot: string): string {
	const config = JSON.stringify({ token, projectRoot }).replace(
		/</gu,
		"\\u003c",
	);
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<meta name="referrer" content="no-referrer"><title>HoBo Code sessions</title>
<style>body{font:14px ui-monospace,monospace;max-width:72rem;margin:2rem auto;padding:0 1rem;background:#111;color:#eee}button,input,textarea{font:inherit;margin:.25rem;padding:.45rem;background:#222;color:#eee;border:1px solid #555}button:focus,input:focus,textarea:focus{outline:2px solid #8cf}.session{border:1px solid #444;padding:.75rem;margin:.75rem 0}textarea{box-sizing:border-box;width:100%;min-height:9rem}.error{color:#f99}</style></head>
<body><h1>HoBo Code resident sessions</h1><p>Loopback control plane · refreshes every second · delivery requires approval.</p>
<p>Remote: forward this loopback port through a declared Station machine. The server never binds publicly.</p>
<form id="create"><label>Name <input id="name" required></label><label> Branch <input id="branch" placeholder="code/task"></label><button>Create session</button></form>
<main id="sessions" aria-live="polite"></main>
<h2>Full command boundary</h2><p>Paste any <code>hobo.code.session-command/v1</code> envelope.</p>
<textarea id="command" aria-label="Session command JSON"></textarea><label><input id="approved" type="checkbox"> Approve commit, push, PR, stack, or merge</label><button id="send">Send command</button><pre id="result" aria-live="polite"></pre>
<script>const cfg=${config};const headers={authorization:'Bearer '+cfg.token,'content-type':'application/json'};let snapshots=[];
const api=async(path,options={})=>{const r=await fetch(path,{...options,headers});const body=await r.json();if(!r.ok)throw Error(body.error||r.statusText);return body};
const send=async(command,approved=false)=>api('/code/commands',{method:'POST',body:JSON.stringify({command,approved})});
const envelope=(snapshot,name,value)=>({schemaVersion:'hobo.code.session-command/v1',commandId:crypto.randomUUID(),actorId:'browser',sessionId:snapshot.session.id,expectedRevision:String(snapshot.revision),[name]:value});
async function act(id,name,value){const snapshot=snapshots.find(x=>x.session.id===id);await send(envelope(snapshot,name,value));await refresh()}
function button(label,run){const b=document.createElement('button');b.textContent=label;b.onclick=run;return b}
async function refresh(){try{snapshots=await api('/code/sessions');const root=document.querySelector('#sessions');root.replaceChildren();for(const s of snapshots){const card=document.createElement('section');card.className='session';const title=document.createElement('h2');title.textContent=s.session.name+' · '+s.session.branch+' · r'+s.revision;card.append(title,button('Reattach',()=>act(s.session.id,'reattachSession',{clientId:'browser'})),button('Detach',()=>act(s.session.id,'detachSession',{clientId:'browser'})),button('Stop',()=>act(s.session.id,'stopSession',{removeWorktree:false})));for(const p of s.panes){const output=document.createElement('pre');output.textContent=(await api('/code/sessions/'+encodeURIComponent(s.session.id)+'/panes/'+encodeURIComponent(p.id)+'/output?lines=80')).output;card.append(document.createElement('br'),document.createTextNode(p.title+' '+p.id+' '),button('Focus',()=>act(s.session.id,'focusPane',{paneId:p.id})),button('Prompt',async()=>{const input=prompt('Input for '+p.title);if(input!==null)await act(s.session.id,'sendInput',{paneId:p.id,input:input+'\\n'})}),output)}root.append(card)}}catch(e){document.querySelector('#result').textContent=String(e)}}
document.querySelector('#create').onsubmit=async e=>{e.preventDefault();const name=document.querySelector('#name').value;const slug=name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');const id=slug+'-'+crypto.randomUUID().slice(0,8);const branch=document.querySelector('#branch').value||'code/'+id;await send({schemaVersion:'hobo.code.session-command/v1',commandId:crypto.randomUUID(),actorId:'browser',sessionId:id,expectedRevision:'0',createSession:{name,projectRoot:cfg.projectRoot,branch,clientId:'browser'}});await refresh()};
document.querySelector('#send').onclick=async()=>{try{const out=await send(JSON.parse(document.querySelector('#command').value),document.querySelector('#approved').checked);document.querySelector('#result').textContent=JSON.stringify(out,null,2);await refresh()}catch(e){document.querySelector('#result').textContent=String(e)}};refresh();setInterval(refresh,1000);</script></body></html>`;
}

export async function startSessionControlServer(
	options: SessionControlServerOptions,
): Promise<SessionControlServer> {
	const token = options.token ?? randomBytes(32).toString("base64url");
	const control =
		options.control ??
		createLocalSessionControl({ hoboHome: options.hoboHome });
	const server = createServer(async (request, response) => {
		try {
			const url = new URL(request.url ?? "/", "http://127.0.0.1");
			if (request.method === "GET" && url.pathname === "/") {
				if (url.searchParams.get("token") !== token) {
					json(response, 401, { error: "missing session control token" });
					return;
				}
				response.writeHead(200, {
					"cache-control": "no-store",
					"content-security-policy":
						"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'",
					"content-type": "text/html; charset=utf-8",
					"referrer-policy": "no-referrer",
					"x-content-type-options": "nosniff",
				});
				response.end(browserHtml(token, options.projectRoot));
				return;
			}
			if (!authorized(request, token)) {
				json(response, 401, { error: "invalid session control token" });
				return;
			}
			if (request.method === "GET" && url.pathname === "/code/sessions") {
				json(response, 200, (await control.list()).map(sessionSnapshotJson));
				return;
			}
			const match = /^\/code\/sessions\/([^/]+)$/u.exec(url.pathname);
			if (request.method === "GET" && match) {
				const snapshot = await control.load(decodeURIComponent(match[1] ?? ""));
				json(
					response,
					snapshot ? 200 : 404,
					snapshot
						? sessionSnapshotJson(snapshot)
						: { error: "session not found" },
				);
				return;
			}
			const paneOutput =
				/^\/code\/sessions\/([^/]+)\/panes\/([^/]+)\/output$/u.exec(
					url.pathname,
				);
			if (request.method === "GET" && paneOutput) {
				const lines = Number.parseInt(
					url.searchParams.get("lines") ?? "200",
					10,
				);
				json(response, 200, {
					output: await control.capturePane(
						decodeURIComponent(paneOutput[1] ?? ""),
						decodeURIComponent(paneOutput[2] ?? ""),
						lines,
					),
				});
				return;
			}
			if (request.method === "POST" && url.pathname === "/code/commands") {
				const body = (await requestBody(request)) as {
					readonly command?: unknown;
					readonly approved?: unknown;
				};
				const snapshot = await control.execute(
					body.command,
					body.approved === true,
				);
				json(response, 200, sessionSnapshotJson(snapshot));
				return;
			}
			json(response, 404, { error: "not found" });
		} catch (error) {
			json(response, 400, {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	});
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(options.port ?? 0, "127.0.0.1", () => {
			server.off("error", reject);
			resolve();
		});
	});
	const address = server.address();
	if (!address || typeof address === "string")
		throw new Error("server has no port");
	return {
		port: address.port,
		token,
		url: `http://127.0.0.1:${address.port}/?token=${encodeURIComponent(token)}`,
		close: () =>
			new Promise<void>((resolve, reject) => {
				server.close((error) => {
					control.close();
					if (error) reject(error);
					else resolve();
				});
			}),
	};
}
