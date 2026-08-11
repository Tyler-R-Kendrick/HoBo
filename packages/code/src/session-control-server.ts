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
import {
	SessionApprovalRequiredError,
	sessionDeliveryApprovalDigest,
} from "./session-orchestrator.js";

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
<style>body{font:14px ui-monospace,monospace;margin:2rem auto;padding:0 1rem;background:#111;color:#eee}button,input,textarea{font:inherit;margin:.25rem;padding:.45rem;background:#222;color:#eee;border:1px solid #555}button:focus,input:focus,textarea:focus{outline:2px solid #8cf}.session{border:1px solid #444;padding:.75rem;margin:.75rem 0}.tab,.agents,.checkpoints,.delivery{border-left:2px solid #444;margin:.5rem 0;padding:.25rem .75rem}.tab-list{display:flex;gap:.25rem;overflow:auto}.tab-list [aria-selected=true]{background:#8cf;color:#111}.pane-grid{position:relative;min-height:24rem;margin:.5rem 0;border:1px solid #666;background:#080808;overflow:hidden}.pane-grid.fallback{display:grid;grid-template-columns:repeat(auto-fit,minmax(22rem,1fr));height:auto!important;aspect-ratio:auto!important}.pane-tile{position:absolute;box-sizing:border-box;display:flex;flex-direction:column;min-width:0;min-height:0;border:1px solid #666;background:#151515;overflow:hidden}.pane-tile.focused{border-color:#8cf;box-shadow:inset 0 0 0 1px #8cf}.pane{padding:.25rem;flex:0 0 auto}.pane strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pane-tile pre{flex:1;margin:0;padding:.5rem;overflow:auto;white-space:pre;color:#ddd}.fallback .pane-tile{position:relative!important;inset:auto!important;min-height:18rem}.muted{color:#aaa}textarea{box-sizing:border-box;width:100%;min-height:9rem}.error{color:#f99}@media(max-width:48rem){.pane-grid{display:grid;grid-template-columns:1fr;height:auto!important;aspect-ratio:auto!important;overflow:visible}.pane-tile{position:relative!important;inset:auto!important;width:100%!important;height:auto!important;min-height:18rem}}</style></head>
<body><h1>HoBo Code resident sessions</h1><p>Loopback control plane · refreshes every second · delivery requires approval.</p>
<p>Remote: forward this loopback port through a declared Station machine. The server never binds publicly.</p>
<form id="create"><label>Name <input id="name" required></label><label> Branch <input id="branch" placeholder="code/task"></label><button>Create session</button></form>
<main id="sessions" aria-label="Resident sessions"></main>
<h2>Full command boundary</h2><p>Paste any <code>hobo.code.session-command/v1</code> envelope.</p>
<textarea id="command" aria-label="Session command JSON"></textarea><label><input id="approved" type="checkbox"> Approve commit, push, PR, stack, or merge</label><button id="send">Send command</button><pre id="result" aria-live="polite"></pre>
<script>const cfg=${config};const headers={authorization:'Bearer '+cfg.token,'content-type':'application/json'};const clientId=sessionStorage.hoboCodeClientId??='browser-'+crypto.randomUUID();let snapshots=[];
const api=async(path,options={})=>{const r=await fetch(path,{...options,headers});const body=await r.json();if(!r.ok){const error=Error(body.error||r.statusText);error.body=body;error.status=r.status;throw error}return body};
const send=(command,approvalDigest)=>api('/code/commands',{method:'POST',body:JSON.stringify({command,...(approvalDigest?{approvalDigest}:{})})});
const envelope=(snapshot,name,value)=>({schemaVersion:'hobo.code.session-command/v1',commandId:crypto.randomUUID(),actorId:clientId,sessionId:snapshot.session.id,expectedRevision:String(snapshot.revision),[name]:value});
const result=document.querySelector('#result');
async function act(id,name,value,approved=false){const snapshot=snapshots.find(x=>x.session.id===id);if(!snapshot)throw Error('session disappeared');await send(envelope(snapshot,name,value),approved);await refresh(id)}
async function attempt(run){try{await run()}catch(e){result.textContent=String(e)}}
function button(label,action,run){const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.action=action;b.onclick=()=>attempt(run);return b}
function text(label,initial=''){const value=prompt(label,initial);return value===null?null:value.trim()}
function shell(command){return command?['sh','-lc',command]:[]}
function paneGeometry(p){const values=[p.leftColumn,p.topRow,p.width,p.height,p.windowWidth,p.windowHeight].map(Number);if(values.some((n,i)=>!Number.isFinite(n)||(i>1&&n<=0)))return null;return{left:100*values[0]/values[4],top:100*values[1]/values[5],width:100*values[2]/values[4],height:100*values[3]/values[5],ratio:values[4]+'/'+values[5]}}
async function approveCommand(command,label,id){let challenge;try{await send(command);throw Error('delivery command completed without approval')}catch(error){if(error.status!==409||!error.body?.approvalDigest)throw error;challenge=error.body}const details=JSON.stringify(challenge.approval.details,null,2);result.textContent='Approval required for '+label+'\\n\\nExact effect:\\n'+details+'\\n\\nApproval '+challenge.approvalDigest;if(!confirm('Approve '+label+'?\\n\\nExact effect:\\n'+details+'\\n\\nApproval '+challenge.approvalDigest))return;const out=await send(command,challenge.approvalDigest);await refresh(id);return out}
async function approved(id,name,value,label){const snapshot=snapshots.find(x=>x.session.id===id);if(!snapshot)throw Error('session disappeared');return approveCommand(envelope(snapshot,name,value),label,id)}
function paneControls(s,p){const box=document.createElement('div');box.className='pane';const heading=document.createElement('strong');heading.textContent=p.title+' · '+p.id+(p.id===s.focusedPaneId?' · focused':'');box.append(heading,button('Focus','focus-pane',()=>act(s.session.id,'focusPane',{paneId:p.id})),button('Prompt','prompt-pane',async()=>{const input=text('Input for '+p.title);if(input!==null)await act(s.session.id,'sendInput',{paneId:p.id,input:input+'\\n'})}));
	for(const [label,direction,action] of [['Split horizontal','horizontal','split-horizontal'],['Split vertical','vertical','split-vertical']])box.append(button(label,action,async()=>{const title=text(label+' pane title');if(!title)return;const command=text('Command (optional)')??'';await act(s.session.id,'splitPane',{paneId:p.id,direction,title,command:shell(command)})}));
	box.append(button('Close pane','close-pane',()=>confirm('Close pane '+p.title+' ('+p.id+')?')&&act(s.session.id,'closePane',{paneId:p.id})),button('Start agent','start-agent',async()=>{const provider=text('Agent provider','codex');if(!provider)return;const command=text('Agent executable','codex');if(!command)return;const agentPrompt=text('Initial agent prompt','Continue the assigned task.');if(agentPrompt===null)return;await act(s.session.id,'startAgent',{paneId:p.id,provider,command:[command],prompt:agentPrompt})}));
	for(const run of s.agentRuns.filter(x=>x.id===p.agentRunId))box.append(document.createTextNode(' '+run.provider+' · '+run.id+' · '+run.summary+' '),button('Stop agent','stop-agent',()=>confirm('Stop agent '+run.provider+' ('+run.id+') in pane '+p.id+'?')&&act(s.session.id,'stopAgent',{agentRunId:run.id})));
	return box}
async function render(card,s){card.replaceChildren();const running=s.session.lifecycleState==='SESSION_LIFECYCLE_STATE_RUNNING';const failed=s.session.lifecycleState==='SESSION_LIFECYCLE_STATE_FAILED';const attached=s.attachedClientIds.includes(clientId);const title=document.createElement('h2');title.textContent=s.session.name+' · '+s.session.id+' · '+s.session.branch+' · '+(running?'running':failed?'failed':'stopped')+' · r'+s.revision;card.append(title);if(!running){const note=document.createElement('p');note.className='muted';note.textContent=failed?'Session failed unexpectedly. Pane and agent processes are no longer running.':'Session is stopped. Pane and agent processes are no longer running.';card.append(note);return}card.append(attached?button('Detach','detach',()=>act(s.session.id,'detachSession',{clientId})):button('Reattach','reattach',()=>act(s.session.id,'reattachSession',{clientId})),button('Stop session','stop-session',()=>confirm('Stop session '+s.session.name+' ('+s.session.id+')? Running panes and agents will terminate.')&&act(s.session.id,'stopSession',{removeWorktree:false})));
	if(!attached){const note=document.createElement('p');note.className='muted';note.textContent='This browser is detached. Reattach to view pane output and controls.';card.append(note);return}
	card.append(button('New tab','create-tab',async()=>{const title=text('Tab title');if(title)await act(s.session.id,'createTab',{title})}));
	const tabs=document.createElement('nav');tabs.className='tab-list';tabs.role='tablist';for(const tab of s.tabs){const pane=s.panes.find(x=>x.tabId===tab.id);const select=button(tab.title,'select-tab',()=>pane&&act(s.session.id,'focusPane',{paneId:pane.id}));select.role='tab';select.ariaSelected=String(tab.id===s.focusedTabId);tabs.append(select)}card.append(tabs);const tab=s.tabs.find(x=>x.id===s.focusedTabId)??s.tabs[0];if(tab){const group=document.createElement('section');group.className='tab';group.role='tabpanel';const heading=document.createElement('h3');heading.textContent=tab.title+' · '+tab.id;group.append(heading,button('New pane','create-pane',async()=>{const title=text('Pane title');if(!title)return;const command=text('Command (optional)')??'';await act(s.session.id,'createPane',{tabId:tab.id,title,command:shell(command)})}));const panes=s.panes.filter(x=>x.tabId===tab.id);const grid=document.createElement('div');grid.className='pane-grid';const geometry=panes.map(paneGeometry);if(geometry.some(g=>!g)){grid.classList.add('fallback')}else if(geometry[0])grid.style.aspectRatio=geometry[0].ratio;for(const [index,pane] of panes.entries()){const tile=document.createElement('article');tile.className='pane-tile'+(pane.id===s.focusedPaneId?' focused':'');tile.setAttribute('aria-label','Pane '+pane.title);const g=geometry[index];if(g){tile.style.left=g.left+'%';tile.style.top=g.top+'%';tile.style.width=g.width+'%';tile.style.height=g.height+'%'}tile.append(paneControls(s,pane));const output=document.createElement('pre');output.textContent=(await api('/code/sessions/'+encodeURIComponent(s.session.id)+'/panes/'+encodeURIComponent(pane.id)+'/output?lines=80')).output;tile.append(output);grid.append(tile)}group.append(grid);card.append(group)}
	const checkpoints=document.createElement('section');checkpoints.className='checkpoints';checkpoints.append(button('Create checkpoint','create-checkpoint',async()=>{const label=text('Checkpoint label');if(label)await act(s.session.id,'createCheckpoint',{label})}));for(const checkpoint of s.checkpoints)checkpoints.append(document.createTextNode(' '+checkpoint.label+' · '+checkpoint.id+' · '+checkpoint.gitCommit+' '),button('Restore','restore-checkpoint',()=>confirm('Restore checkpoint '+checkpoint.label+' ('+checkpoint.id+') at '+checkpoint.gitCommit+'? Current worktree must be clean.')&&act(s.session.id,'restoreCheckpoint',{checkpointId:checkpoint.id})));card.append(checkpoints);
	const delivery=document.createElement('section');delivery.className='delivery';const heading=document.createElement('h3');heading.textContent='Approved delivery';delivery.append(heading,button('Commit','commit',async()=>{const message=text('Commit message');if(message)await approved(s.session.id,'commit',{message},'commit "'+message+'"')}),button('Push','push',async()=>{const remote=text('Remote','origin');if(remote)await approved(s.session.id,'push',{remote},'push to '+remote)}),button('Open PR','open-pr',async()=>{const title=text('Pull request title');if(!title)return;const body=text('Pull request body')??'';await approved(s.session.id,'openPullRequest',{title,body,draft:false},'pull request "'+title+'"')}),button('Stack PR','stack-pr',async()=>{const parentBranch=text('Parent branch','main');if(!parentBranch)return;const title=text('Pull request title');if(title)await approved(s.session.id,'stackPullRequest',{parentBranch,title,body:''},'stacked pull request "'+title+'" onto '+parentBranch)}),button('Merge PR','merge-pr',async()=>{const pullRequestNumber=text('Pull request number',String(s.deliveryState?.pullRequestNumber??''));if(pullRequestNumber)await approved(s.session.id,'mergePullRequest',{pullRequestNumber:Number(pullRequestNumber)},'pull request #'+pullRequestNumber)}));card.append(delivery)}
async function refresh(forceId){try{snapshots=await api('/code/sessions');const root=document.querySelector('#sessions');const cards=new Map([...root.querySelectorAll('.session')].map(card=>[card.dataset.sessionId,card]));const seen=new Set();for(const s of snapshots){seen.add(s.session.id);let card=cards.get(s.session.id);if(!card){card=document.createElement('section');card.className='session';card.dataset.sessionId=s.session.id;root.append(card)}if(card.contains(document.activeElement)&&s.session.id!==forceId)continue;await render(card,s)}for(const [id,card] of cards)if(!seen.has(id))card.remove()}catch(e){result.textContent=String(e)}}
document.querySelector('#create').onsubmit=async e=>{e.preventDefault();const name=document.querySelector('#name').value;const slug=name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');const id=slug+'-'+crypto.randomUUID().slice(0,8);const branch=document.querySelector('#branch').value||'code/'+id;await send({schemaVersion:'hobo.code.session-command/v1',commandId:crypto.randomUUID(),actorId:clientId,sessionId:id,expectedRevision:'0',createSession:{name,projectRoot:cfg.projectRoot,branch,clientId}});await refresh()};
document.querySelector('#send').onclick=()=>attempt(async()=>{const command=JSON.parse(document.querySelector('#command').value);const out=document.querySelector('#approved').checked?await approveCommand(command,'raw delivery command'):await send(command);if(out)result.textContent=JSON.stringify(out,null,2);await refresh()});refresh();setInterval(refresh,1000);</script></body></html>`;
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
					readonly approvalDigest?: unknown;
				};
				const snapshot = await control.execute(
					body.command,
					typeof body.approvalDigest === "string" ? body.approvalDigest : false,
				);
				json(response, 200, sessionSnapshotJson(snapshot));
				return;
			}
			json(response, 404, { error: "not found" });
		} catch (error) {
			if (error instanceof SessionApprovalRequiredError) {
				json(response, 409, {
					error: error.message,
					approval: error.approval,
					approvalDigest: sessionDeliveryApprovalDigest(error.approval),
				});
				return;
			}
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
