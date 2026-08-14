import { randomBytes, timingSafeEqual } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fromJson, type JsonValue } from "@bufbuild/protobuf";
import {
	buildCorrelation,
	createDebugReplayRecorder,
	createFilesystemDualFixtures,
	type DebugReplayLevel,
	loadPlayerPayload,
} from "@hobo/replay";
import {
	GitWorkbenchActionKind,
	GitWorkbenchActionRequestSchema,
	GitWorkbenchSelectionKind,
} from "./_generated/code_harness_pb.js";
import { parseBrowserRecording } from "./browser-recording.js";
import { exportEvidenceRecordingAutomation } from "./evidence-automation.js";
import {
	parseEvidenceOverlayMessage,
	renderEvidenceOverlayControls,
} from "./evidence-overlay.js";
import { createEvidencePort } from "./evidence-port.js";
import {
	type EvidenceFact,
	projectEvidenceReport,
	renderEvidenceJournalEventHtml,
	renderEvidenceJournalHtml,
	renderEvidenceReportExport,
} from "./evidence-report.js";
import {
	type GitSelection,
	type GitWorkbenchAction,
	readGitWorkbenchSnapshot,
	runGitWorkbenchAction,
} from "./git-workbench.js";
import { parseSkillName } from "./harness.js";
import {
	createLocalSessionControl,
	type LocalSessionControl,
} from "./local-session-control.js";
import { sessionSnapshotJson } from "./session-contract.js";
import {
	type EvidenceJournal,
	projectSessionEvidenceJournal,
	readCurrentSessionContext,
	sessionEvidenceSubject,
} from "./session-evidence.js";
import {
	SessionApprovalRequiredError,
	sessionDeliveryApprovalDigest,
	sessionProcessRunner,
} from "./session-orchestrator.js";

export interface SessionControlServerOptions {
	readonly hoboHome: string;
	readonly projectRoot: string;
	readonly port?: number;
	readonly token?: string;
	readonly control?: LocalSessionControl;
	readonly replayLevel?: DebugReplayLevel;
}

export interface SessionControlServer {
	readonly port: number;
	readonly token: string;
	readonly url: string;
	readonly reportUrl: string;
	readonly controlsUrlTemplate: string;
	controlsUrl(parentOrigin: string, sessionId?: string): string;
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

export function saveRecordingCapability(
	projectRoot: string,
	exported: ReturnType<typeof exportEvidenceRecordingAutomation>,
): void {
	parseSkillName(exported.capabilityId);
	const projectRealPath = realpathSync(projectRoot);
	const hoboRoot = join(projectRoot, ".hobo");
	mkdirSync(hoboRoot, { recursive: true });
	assertDescendant(projectRealPath, realpathSync(hoboRoot));
	const recordingsRoot = join(hoboRoot, "recordings");
	mkdirSync(recordingsRoot, { recursive: true });
	assertDescendant(projectRealPath, realpathSync(recordingsRoot));
	const target = join(recordingsRoot, exported.capabilityId);
	if (existsSync(target))
		throw new Error(`capability already exists: ${exported.capabilityId}`);
	const staging = join(
		recordingsRoot,
		`.${exported.capabilityId}-${randomBytes(8).toString("hex")}`,
	);
	mkdirSync(staging, { recursive: true });
	try {
		for (const artifact of exported.artifacts) {
			const prefix = `.hobo/recordings/${exported.capabilityId}/`;
			if (!artifact.path.startsWith(prefix))
				throw new Error("automation artifact escaped its capability directory");
			const path = resolve(staging, artifact.path.slice(prefix.length));
			assertDescendant(staging, path);
			mkdirSync(dirname(path), { recursive: true });
			writeFileSync(path, artifact.contents, { encoding: "utf8", flag: "wx" });
		}
		renameSync(staging, target);
	} catch (error) {
		rmSync(staging, { recursive: true, force: true });
		throw error;
	}
}

function assertDescendant(root: string, candidate: string): void {
	const child = relative(root, candidate);
	if (child.startsWith("..") || isAbsolute(child))
		throw new Error("recording capability path escaped the project root");
}

function parseGitWorkbenchAction(input: unknown): GitWorkbenchAction {
	const body = fromJson(GitWorkbenchActionRequestSchema, input as JsonValue, {
		ignoreUnknownFields: false,
	});
	const actions = {
		[GitWorkbenchActionKind.FETCH]: "fetch",
		[GitWorkbenchActionKind.PULL]: "pull",
		[GitWorkbenchActionKind.BRANCH_CREATE]: "branch-create",
		[GitWorkbenchActionKind.BRANCH_CHECKOUT]: "branch-checkout",
		[GitWorkbenchActionKind.BRANCH_DELETE]: "branch-delete",
		[GitWorkbenchActionKind.STASH_CREATE]: "stash-create",
		[GitWorkbenchActionKind.STASH_APPLY]: "stash-apply",
		[GitWorkbenchActionKind.STASH_POP]: "stash-pop",
		[GitWorkbenchActionKind.STASH_DROP]: "stash-drop",
		[GitWorkbenchActionKind.FILE_DISCARD]: "file-discard",
		[GitWorkbenchActionKind.FILE_IGNORE]: "file-ignore",
		[GitWorkbenchActionKind.COMMIT_REVERT]: "commit-revert",
	} as const;
	const action = actions[body.action as keyof typeof actions];
	if (!action) throw new Error("invalid Git workbench action");
	if (action === "fetch" || action === "pull") return { action };
	if (action === "branch-create") return { action, name: body.argument };
	if (action === "stash-create") return { action, message: body.argument };
	if (!body.selection?.value)
		throw new Error("missing Git workbench selection");
	const kinds = {
		[GitWorkbenchSelectionKind.FILE]: "file",
		[GitWorkbenchSelectionKind.BRANCH]: "branch",
		[GitWorkbenchSelectionKind.COMMIT]: "commit",
		[GitWorkbenchSelectionKind.STASH]: "stash",
	} as const;
	const kind = kinds[body.selection.kind as keyof typeof kinds];
	if (!kind) throw new Error("invalid Git workbench selection");
	return {
		action,
		selection: { kind, value: body.selection.value },
	} as GitWorkbenchAction;
}

async function requestBody(request: IncomingMessage): Promise<unknown> {
	return JSON.parse(
		(await requestBytes(request, 1_048_576)).toString("utf8") || "{}",
	);
}

async function requestBytes(
	request: IncomingMessage,
	maximum: number,
): Promise<Buffer> {
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of request) {
		const bytes = Buffer.from(chunk);
		size += bytes.length;
		if (size > maximum) throw new Error("request body exceeds capture limit");
		chunks.push(bytes);
	}
	return Buffer.concat(chunks);
}

function browserHtml(token: string, projectRoot: string): string {
	const config = JSON.stringify({ token, projectRoot }).replace(
		/</gu,
		"\\u003c",
	);
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<meta name="referrer" content="no-referrer"><title>HoBo Code sessions</title>
<style>
:root{color-scheme:dark;--ink:#d9e0e7;--muted:#82909e;--bg:#081015;--panel:#0d171d;--raised:#132128;--line:#29404b;--focus:#8bd5ca;--accent:#f5a97f;--good:#a6da95;--bad:#ed8796}
*{box-sizing:border-box}body{font:14px ui-monospace,SFMono-Regular,Consolas,monospace;margin:2rem auto;padding:0 1rem;max-width:100rem;background:var(--bg);color:var(--ink)}button,input,textarea{font:inherit;margin:.25rem;padding:.45rem;background:var(--raised);color:var(--ink);border:1px solid var(--line)}button:hover{border-color:var(--accent)}button:focus-visible,input:focus-visible,textarea:focus-visible,[tabindex]:focus-visible{outline:2px solid var(--focus);outline-offset:1px}.session{border:1px solid var(--line);padding:.75rem;margin:.75rem 0;background:#0a1318}.tab,.agents,.checkpoints,.delivery{border-left:2px solid var(--line);margin:.5rem 0;padding:.25rem .75rem}.tab-list{display:flex;gap:.25rem;overflow:auto}.tab-list [aria-selected=true]{background:var(--focus);color:#081015}.pane-grid{position:relative;min-height:24rem;margin:.5rem 0;border:1px solid var(--line);background:#05090b;overflow:hidden}.pane-grid.fallback{display:grid;grid-template-columns:repeat(auto-fit,minmax(22rem,1fr));height:auto!important;aspect-ratio:auto!important}.pane-tile{position:absolute;box-sizing:border-box;display:flex;flex-direction:column;min-width:0;min-height:0;border:1px solid var(--line);background:var(--panel);overflow:hidden}.pane-tile.focused{border-color:var(--focus);box-shadow:inset 0 0 0 1px var(--focus)}.pane{padding:.25rem;flex:0 0 auto}.pane strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pane-tile pre{flex:1;margin:0;padding:.5rem;overflow:auto;white-space:pre;color:var(--ink)}.fallback .pane-tile{position:relative!important;inset:auto!important;min-height:18rem}.muted{color:var(--muted)}textarea{width:100%;min-height:9rem}.error{color:var(--bad)}
.git-workbench{display:grid;grid-template-columns:minmax(18rem,32rem) minmax(24rem,1fr);gap:.5rem;margin-top:.5rem;min-height:42rem}.git-sidebar,.git-main{display:flex;flex-direction:column;gap:.5rem;min-width:0}.git-panel{border:1px solid var(--line);background:var(--panel);min-height:0}.git-panel h3{font-size:.8rem;letter-spacing:.08em;text-transform:uppercase;margin:0;padding:.4rem .55rem;background:var(--raised);color:var(--muted)}.git-list{max-height:11rem;overflow:auto}.git-row{display:grid;grid-template-columns:3.5rem minmax(0,1fr);gap:.45rem;width:100%;margin:0;border:0;border-top:1px solid #16262e;text-align:left;background:transparent}.git-row[aria-selected=true]{background:#18313a;color:#fff}.git-mark{color:var(--accent)}.git-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.git-diff{flex:1;min-height:25rem;margin:0;padding:.75rem;overflow:auto;white-space:pre;tab-size:4;background:#060b0e;color:var(--ink)}.git-summary{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;padding:.5rem;border:1px solid var(--line);background:var(--panel)}.git-summary strong{color:var(--focus)}.git-actions{display:flex;flex-wrap:wrap;align-items:center;padding:.25rem;border:1px solid var(--line);background:var(--panel)}.git-hints{color:var(--muted);margin-left:auto;padding:.4rem}.git-pipeline{display:flex;gap:.35rem;align-items:center}.git-pipeline span{color:var(--muted)}.git-pipeline .ready{color:var(--good)}
@media(max-width:48rem){body{margin:.75rem auto}.pane-grid{display:grid;grid-template-columns:1fr;height:auto!important;aspect-ratio:auto!important;overflow:visible}.pane-tile{position:relative!important;inset:auto!important;width:100%!important;height:auto!important;min-height:18rem}.git-workbench{display:flex;flex-direction:column;min-height:0}.git-main{order:-1}.git-diff{min-height:18rem;max-height:55vh}.git-list{max-height:9rem}.git-hints{width:100%;margin:0}}
</style></head>
<body><h1>HoBo Code resident sessions</h1><p>Loopback control plane · refreshes every second · delivery requires approval.</p>
<p><strong>Authenticated</strong> · bearer-protected loopback control. · <a href="/__hobo/evidence?token=${encodeURIComponent(token)}">Evidence report</a></p>
<p>Remote: forward this loopback port through a declared Station machine. The server never binds publicly.</p>
<form id="create"><label>Name <input id="name" required></label><label> Branch <input id="branch" placeholder="code/task"></label><button>Create session</button></form>
<main id="sessions" aria-label="Resident sessions"></main>
<h2>Full command boundary</h2><p>Paste any <code>hobo.code.session-command/v1</code> envelope.</p>
<textarea id="command" aria-label="Session command JSON"></textarea><label><input id="approved" type="checkbox"> Approve commit, push, PR, stack, or merge</label><button id="send">Send command</button><pre id="result" aria-live="polite"></pre>
<script>const cfg=${config};const headers={authorization:'Bearer '+cfg.token,'content-type':'application/json'};const clientId=sessionStorage.hoboCodeClientId??='browser-'+crypto.randomUUID();let snapshots=[];let refreshFlight;const forcedRefreshIds=new Set();const activeSurface=new Map();const gitSelections=new Map();const gitMutationFlights=new Map();
const api=async(path,options={})=>{const r=await fetch(path,{...options,headers});const body=await r.json();if(!r.ok){const error=Error(body.error||r.statusText);error.body=body;error.status=r.status;throw error}return body};
const send=(command,approvalDigest)=>api('/code/commands',{method:'POST',body:JSON.stringify({command,...(approvalDigest?{approvalDigest}:{})})});
const envelope=(snapshot,name,value)=>({schemaVersion:'hobo.code.session-command/v1',commandId:crypto.randomUUID(),actorId:clientId,sessionId:snapshot.session.id,expectedRevision:String(snapshot.revision),[name]:value});
const result=document.querySelector('#result');
async function act(id,name,value,approved=false){const snapshot=snapshots.find(x=>x.session.id===id);if(!snapshot)throw Error('session disappeared');await send(envelope(snapshot,name,value),approved);result.textContent=name+' completed';await refresh(id)}
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

function gitRow(s,panel,kind,value,mark,label){const row=button('',kind+'-row',()=>selectGit(s,panel,kind,value));row.className='git-row';row.dataset.gitPanel=String(panel);row.dataset.gitKind=kind;row.dataset.gitValue=value;const selected=gitSelections.get(s.session.id);row.ariaSelected=String(selected?.panel===panel&&selected?.kind===kind&&selected?.value===value);const badge=document.createElement('span');badge.className='git-mark';badge.textContent=mark;const name=document.createElement('span');name.className='git-label';name.textContent=label;row.append(badge,name);return row}
function gitPanel(number,title,rows,truncated=false){const panel=document.createElement('section');panel.className='git-panel';panel.dataset.gitPanel=String(number);const heading=document.createElement('h3');heading.textContent=number+' '+title+(truncated?' · first '+rows.length+'+':'');const list=document.createElement('div');list.className='git-list';list.append(...rows);if(!rows.length){const empty=document.createElement('p');empty.className='muted';empty.textContent='  —';list.append(empty)}panel.append(heading,list);return panel}
function selectedGitRow(s,selected=gitSelections.get(s.session.id)){if(!selected)return;const card=[...document.querySelectorAll('.session')].find(node=>node.dataset.sessionId===s.session.id);return [...(card?.querySelectorAll('.git-row')??[])].find(row=>row.dataset.gitPanel===String(selected.panel)&&row.dataset.gitKind===selected.kind&&row.dataset.gitValue===selected.value)}
async function selectGit(s,panel,kind,value){gitSelections.set(s.session.id,{panel,kind,value});await refresh(s.session.id);selectedGitRow(s,{panel,kind,value})?.focus()}
function toggleGitFile(s){const previous=gitMutationFlights.get(s.session.id)??Promise.resolve();const flight=previous.then(async()=>{const selected=gitSelections.get(s.session.id);if(selected?.kind!=='file')return;const git=await api('/code/sessions/'+encodeURIComponent(s.session.id)+'/git?kind=file&value='+encodeURIComponent(selected.value));const file=git.files.find(item=>item.path===selected.value);if(!file)return;const unstage=file.staged&&!file.unstaged&&!file.untracked;await act(s.session.id,unstage?'unstagePaths':'stagePaths',{paths:[file.path]});selectedGitRow(s,selected)?.focus()}).finally(()=>{if(gitMutationFlights.get(s.session.id)===flight)gitMutationFlights.delete(s.session.id)});gitMutationFlights.set(s.session.id,flight);return flight}
function gitActionBody(request){return{action:'GIT_WORKBENCH_ACTION_KIND_'+request.action.replaceAll('-','_').toUpperCase(),...(request.selection?{selection:{kind:'GIT_WORKBENCH_SELECTION_KIND_'+request.selection.kind.toUpperCase(),value:request.selection.value}}:{}),argument:request.name??request.message??''}}
async function localGit(s,request,label,confirmEffect=false){if(confirmEffect&&!confirm(label+'?\\n\\nExact effect:\\n'+JSON.stringify(request,null,2)))return;await api('/code/sessions/'+encodeURIComponent(s.session.id)+'/git/actions',{method:'POST',body:JSON.stringify(gitActionBody(request))});result.textContent=label+' completed';await refresh(s.session.id);selectedGitRow(s)?.focus()}
async function gitWorkbench(s){let selected=gitSelections.get(s.session.id);let query=selected?'?kind='+encodeURIComponent(selected.kind)+'&value='+encodeURIComponent(selected.value):'';let git;try{git=await api('/code/sessions/'+encodeURIComponent(s.session.id)+'/git'+query)}catch(error){if(!selected)throw error;gitSelections.delete(s.session.id);selected=undefined;git=await api('/code/sessions/'+encodeURIComponent(s.session.id)+'/git')}
	if(!selected){const first=git.files[0];const commit=git.commits[0];if(first)gitSelections.set(s.session.id,selected={panel:2,kind:'file',value:first.path});else if(commit)gitSelections.set(s.session.id,selected={panel:4,kind:'commit',value:commit.oid});if(selected)git=await api('/code/sessions/'+encodeURIComponent(s.session.id)+'/git?kind='+encodeURIComponent(selected.kind)+'&value='+encodeURIComponent(selected.value))}
	const workbench=document.createElement('section');workbench.className='git-workbench';workbench.tabIndex=0;workbench.setAttribute('aria-label','Git workbench');
	const sidebar=document.createElement('div');sidebar.className='git-sidebar';const statusRows=git.branch?[gitRow(s,1,'branch',git.branch,git.ahead+'↑ '+git.behind+'↓',git.branch+(git.upstream?' → '+git.upstream:''))]:git.commits[0]?[gitRow(s,1,'commit',git.commits[0].oid,'HEAD','detached at '+git.commits[0].shortOid)]:[];sidebar.append(gitPanel(1,'Status',statusRows),gitPanel(2,'Files',git.files.map(file=>gitRow(s,2,'file',file.path,file.untracked?'??':file.staged&&file.unstaged?'MM':file.staged?'S':'M',file.path)),git.truncated.files),gitPanel(3,'Branches',git.branches.map(branch=>gitRow(s,3,'branch',branch.name,branch.current?'*':'',branch.name+(branch.upstream?' → '+branch.upstream:''))),git.truncated.branches));
	const main=document.createElement('div');main.className='git-main';const summary=document.createElement('div');summary.className='git-summary';const branch=document.createElement('strong');branch.textContent=git.branch??'detached HEAD';const counts=document.createElement('span');counts.textContent=git.files.length+(git.truncated.files?'+':'')+' changed · '+git.files.filter(file=>file.staged).length+(git.truncated.files?'+':'')+' staged';const pipeline=document.createElement('span');pipeline.className='git-pipeline';pipeline.innerHTML='<span class="ready">● worktree</span><span>›</span><span>commit</span><span>›</span><span>push</span><span>›</span><span>PR</span><span>›</span><span>merge</span>';summary.append(branch,counts,pipeline);main.append(summary,gitPanel(4,'Commits',git.commits.map(commit=>gitRow(s,4,'commit',commit.oid,commit.graph+' '+commit.shortOid,commit.subject+' · '+commit.author)),git.truncated.commits),gitPanel(5,'Stash',git.stashes.map(stash=>gitRow(s,5,'stash',stash.ref,'≡',stash.subject)),git.truncated.stashes));
	const diffPanel=document.createElement('section');diffPanel.className='git-panel';const diffHeading=document.createElement('h3');diffHeading.textContent='Preview'+(git.selectedDiff?' · '+git.selectedDiff.path:'');const diff=document.createElement('pre');diff.className='git-diff';diff.textContent=git.selectedDiff?.text??'Select a file, branch, commit, or stash to inspect it.';diffPanel.append(diffHeading,diff);main.append(diffPanel);
	const actions=document.createElement('div');actions.className='git-actions';const commit=button('Commit','git-commit',async()=>{if(git.truncated.files)throw Error('Commit disabled: more than 200 changed files; use the terminal for a complete review.');const message=text('Commit staged changes');if(message)await approved(s.session.id,'commit',{message,stagedOnly:true},'staged commit "'+message+'"')});commit.disabled=git.truncated.files;const selection=gitSelections.get(s.session.id);const selectedFile=selection?.kind==='file'?git.files.find(file=>file.path===selection.value):undefined;actions.append(button('Stage / unstage','git-stage',()=>toggleGitFile(s)),button('Discard','git-discard',()=>selection?.kind==='file'&&localGit(s,{action:'file-discard',selection},'discard '+selection.value,true)),button('Ignore','git-ignore',()=>selectedFile?.untracked&&localGit(s,{action:'file-ignore',selection},'ignore '+selection.value,true)),button('Fetch','git-fetch',()=>localGit(s,{action:'fetch'},'fetch')),button('Pull','git-pull',()=>localGit(s,{action:'pull'},'fast-forward pull',true)),button('Checkout','git-checkout',()=>selection?.kind==='branch'&&localGit(s,{action:'branch-checkout',selection},'checkout '+selection.value,true)),button('New branch','git-new-branch',async()=>{const name=text('New branch name');if(name)await localGit(s,{action:'branch-create',name},'create branch '+name)}),button('Delete branch','git-delete-branch',()=>selection?.kind==='branch'&&localGit(s,{action:'branch-delete',selection},'delete branch '+selection.value,true)),button('Stash all','git-stash-create',async()=>{const message=text('Stash message','HoBo Code workbench');if(message)await localGit(s,{action:'stash-create',message},'stash worktree')}),button('Apply stash','git-stash-apply',()=>selection?.kind==='stash'&&localGit(s,{action:'stash-apply',selection},'apply '+selection.value,true)),button('Pop stash','git-stash-pop',()=>selection?.kind==='stash'&&localGit(s,{action:'stash-pop',selection},'pop '+selection.value,true)),button('Drop stash','git-stash-drop',()=>selection?.kind==='stash'&&localGit(s,{action:'stash-drop',selection},'drop '+selection.value,true)),button('Revert commit','git-revert',()=>selection?.kind==='commit'&&localGit(s,{action:'commit-revert',selection},'revert '+selection.value,true)),commit,button('Push','git-push',async()=>{const remote=text('Remote','origin');if(remote)await approved(s.session.id,'push',{remote},'push to '+remote)}),button('Open PR','git-open-pr',async()=>{const title=text('Pull request title');if(!title)return;await approved(s.session.id,'openPullRequest',{title,body:'',draft:false},'pull request "'+title+'"')}),button('Stack','git-stack',async()=>{const parentBranch=text('Parent branch','main');const title=text('Pull request title');if(parentBranch&&title)await approved(s.session.id,'stackPullRequest',{parentBranch,title,body:''},'stacked pull request "'+title+'" onto '+parentBranch)}),button('Merge','git-merge',async()=>{const number=text('Pull request number',String(s.deliveryState?.pullRequestNumber??''));if(number)await approved(s.session.id,'mergePullRequest',{pullRequestNumber:Number(number)},'pull request #'+number)}));const hints=document.createElement('span');hints.className='git-hints';hints.textContent='1–5 panels · ↑↓/jk move · Space stage · c commit · p push';actions.append(hints);main.append(actions);workbench.append(sidebar,main);
	workbench.onkeydown=e=>{const rows=[...workbench.querySelectorAll('.git-row')];const current=rows.indexOf(document.activeElement);if(/^[1-5]$/u.test(e.key)){e.preventDefault();workbench.querySelector('[data-git-panel="'+e.key+'"] .git-row')?.click();return}if(['ArrowDown','j','ArrowUp','k'].includes(e.key)){e.preventDefault();const delta=e.key==='ArrowUp'||e.key==='k'?-1:1;const row=rows[Math.max(0,Math.min(rows.length-1,current<0?0:current+delta))];row?.click();return}if(e.key===' '){e.preventDefault();attempt(()=>toggleGitFile(s));return}if(e.key==='c'){e.preventDefault();commit.click();return}if(e.key==='p'){e.preventDefault();actions.querySelector('[data-action=git-push]')?.click()}};return workbench}
async function render(card,s){card.replaceChildren();const running=s.session.lifecycleState==='SESSION_LIFECYCLE_STATE_RUNNING';const failed=s.session.lifecycleState==='SESSION_LIFECYCLE_STATE_FAILED';const attached=s.attachedClientIds.includes(clientId);const title=document.createElement('h2');title.textContent=s.session.name+' · '+s.session.id+' · '+s.session.branch+' · '+(running?'running':failed?'failed':'stopped')+' · r'+s.revision;card.append(title);if(!running){const note=document.createElement('p');note.className='muted';note.textContent=failed?'Session failed unexpectedly. Pane and agent processes are no longer running.':'Session is stopped. Pane and agent processes are no longer running.';card.append(note);return}card.append(attached?button('Detach','detach',()=>act(s.session.id,'detachSession',{clientId})):button('Reattach','reattach',()=>act(s.session.id,'reattachSession',{clientId})),button('Stop session','stop-session',()=>confirm('Stop session '+s.session.name+' ('+s.session.id+')? Running panes and agents will terminate.')&&act(s.session.id,'stopSession',{removeWorktree:false})));
	if(!attached){const note=document.createElement('p');note.className='muted';note.textContent='This browser is detached. Reattach to view pane output and controls.';card.append(note);return}
	card.append(button('New tab','create-tab',async()=>{const title=text('Tab title');if(title)await act(s.session.id,'createTab',{title})}));
	const surface=activeSurface.get(s.session.id)??'terminal';const tabs=document.createElement('nav');tabs.className='tab-list';tabs.role='tablist';for(const tab of s.tabs){const pane=s.panes.find(x=>x.tabId===tab.id);const select=button(tab.title,'select-tab',async()=>{activeSurface.set(s.session.id,'terminal');if(pane)await act(s.session.id,'focusPane',{paneId:pane.id})});select.role='tab';select.ariaSelected=String(surface==='terminal'&&tab.id===s.focusedTabId);tabs.append(select)}const gitTab=button('Git','select-git-tab',async()=>{activeSurface.set(s.session.id,'git');await refresh(s.session.id)});gitTab.role='tab';gitTab.ariaSelected=String(surface==='git');tabs.append(gitTab);card.append(tabs);if(surface==='git'){card.append(await gitWorkbench(s));return}const tab=s.tabs.find(x=>x.id===s.focusedTabId)??s.tabs[0];if(tab){const group=document.createElement('section');group.className='tab';group.role='tabpanel';const heading=document.createElement('h3');heading.textContent=tab.title+' · '+tab.id;group.append(heading,button('New pane','create-pane',async()=>{const title=text('Pane title');if(!title)return;const command=text('Command (optional)')??'';await act(s.session.id,'createPane',{tabId:tab.id,title,command:shell(command)})}));const panes=s.panes.filter(x=>x.tabId===tab.id);const grid=document.createElement('div');grid.className='pane-grid';const geometry=panes.map(paneGeometry);if(geometry.some(g=>!g)){grid.classList.add('fallback')}else if(geometry[0])grid.style.aspectRatio=geometry[0].ratio;for(const [index,pane] of panes.entries()){const tile=document.createElement('article');tile.className='pane-tile'+(pane.id===s.focusedPaneId?' focused':'');tile.setAttribute('aria-label','Pane '+pane.title);const g=geometry[index];if(g){tile.style.left=g.left+'%';tile.style.top=g.top+'%';tile.style.width=g.width+'%';tile.style.height=g.height+'%'}tile.append(paneControls(s,pane));const output=document.createElement('pre');output.textContent=(await api('/code/sessions/'+encodeURIComponent(s.session.id)+'/panes/'+encodeURIComponent(pane.id)+'/output?lines=80')).output;tile.append(output);grid.append(tile)}group.append(grid);card.append(group)}
	const checkpoints=document.createElement('section');checkpoints.className='checkpoints';checkpoints.append(button('Create checkpoint','create-checkpoint',async()=>{const label=text('Checkpoint label');if(label)await act(s.session.id,'createCheckpoint',{label})}));for(const checkpoint of s.checkpoints)checkpoints.append(document.createTextNode(' '+checkpoint.label+' · '+checkpoint.id+' · '+checkpoint.gitCommit+' '),button('Restore','restore-checkpoint',()=>confirm('Restore checkpoint '+checkpoint.label+' ('+checkpoint.id+') at '+checkpoint.gitCommit+'? Current worktree must be clean.')&&act(s.session.id,'restoreCheckpoint',{checkpointId:checkpoint.id})));card.append(checkpoints);
	const delivery=document.createElement('section');delivery.className='delivery';const heading=document.createElement('h3');heading.textContent='Approved delivery';delivery.append(heading,button('Commit','commit',async()=>{const message=text('Commit message');if(message)await approved(s.session.id,'commit',{message},'commit "'+message+'"')}),button('Push','push',async()=>{const remote=text('Remote','origin');if(remote)await approved(s.session.id,'push',{remote},'push to '+remote)}),button('Open PR','open-pr',async()=>{const title=text('Pull request title');if(!title)return;const body=text('Pull request body')??'';await approved(s.session.id,'openPullRequest',{title,body,draft:false},'pull request "'+title+'"')}),button('Stack PR','stack-pr',async()=>{const parentBranch=text('Parent branch','main');if(!parentBranch)return;const title=text('Pull request title');if(title)await approved(s.session.id,'stackPullRequest',{parentBranch,title,body:''},'stacked pull request "'+title+'" onto '+parentBranch)}),button('Merge PR','merge-pr',async()=>{const pullRequestNumber=text('Pull request number',String(s.deliveryState?.pullRequestNumber??''));if(pullRequestNumber)await approved(s.session.id,'mergePullRequest',{pullRequestNumber:Number(pullRequestNumber)},'pull request #'+pullRequestNumber)}));card.append(delivery)}
async function refreshNow(forceIds){try{snapshots=await api('/code/sessions');const root=document.querySelector('#sessions');const cards=new Map([...root.querySelectorAll('.session')].map(card=>[card.dataset.sessionId,card]));const seen=new Set();for(const s of snapshots){seen.add(s.session.id);let card=cards.get(s.session.id);if(!card){card=document.createElement('section');card.className='session';card.dataset.sessionId=s.session.id;root.append(card)}const focused=card.contains(document.activeElement);if(focused&&!forceIds.has(s.session.id))continue;const scrollY=window.scrollY;await render(card,s);if(focused)selectedGitRow(s)?.focus();window.scrollTo(0,scrollY)}for(const [id,card] of cards)if(!seen.has(id))card.remove()}catch(e){result.textContent=String(e)}}
function refresh(forceId){if(forceId)forcedRefreshIds.add(forceId);if(!refreshFlight)refreshFlight=(async()=>{do{const forceIds=new Set(forcedRefreshIds);forcedRefreshIds.clear();await refreshNow(forceIds)}while(forcedRefreshIds.size)})().finally(()=>{refreshFlight=undefined});return refreshFlight}
document.querySelector('#create').onsubmit=async e=>{e.preventDefault();const name=document.querySelector('#name').value;const slug=name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');const id=slug+'-'+crypto.randomUUID().slice(0,8);const branch=document.querySelector('#branch').value||'code/'+id;await send({schemaVersion:'hobo.code.session-command/v1',commandId:crypto.randomUUID(),actorId:clientId,sessionId:id,expectedRevision:'0',createSession:{name,projectRoot:cfg.projectRoot,branch,clientId}});await refresh()};
document.querySelector('#send').onclick=()=>attempt(async()=>{const command=JSON.parse(document.querySelector('#command').value);const out=document.querySelector('#approved').checked?await approveCommand(command,'raw delivery command'):await send(command);if(out)result.textContent=JSON.stringify(out,null,2);await refresh()});refresh();setInterval(refresh,1000);</script></body></html>`;
}

function currentEvidenceJournal(
	hoboHome: string,
	evidence: ReturnType<typeof createEvidencePort>,
	generatedAt = new Date().toISOString(),
) {
	return projectSessionEvidenceJournal({
		hoboHome,
		evidence,
		generatedAt,
	});
}

const RECORD_SECTIONS = {
	status: "progress",
	test: "tests",
	feature: "features",
	decision: "adrs",
	diagram: "diagrams",
	screenshot: "features",
	recording: "features",
	replay: "replay",
	annotation: "features",
	note: "progress",
} as const;

function journalSection(
	event: EvidenceJournal["events"][number],
): EvidenceFact["section"] {
	if (event.sourceKind) return RECORD_SECTIONS[event.sourceKind];
	if (event.kind === "ask" || event.kind === "status") return "session";
	if (event.kind === "decision") return "adrs";
	if (event.kind === "look") return "features";
	return "progress";
}

function currentEvidenceReport(
	hoboHome: string,
	projectRoot: string,
	evidence: ReturnType<typeof createEvidencePort>,
) {
	const journal = currentEvidenceJournal(hoboHome, evidence);
	const facts: EvidenceFact[] = journal.events.map((event) => ({
		id: event.id,
		section: journalSection(event),
		title: event.title,
		detail: event.reason,
		state: event.state,
		observedAt: event.at,
		...(event.artifacts.length > 0 ? { artifacts: event.artifacts } : {}),
	}));
	return projectEvidenceReport({
		reportId: journal.sessionId
			? `session:${journal.sessionId}`
			: `project:${projectRoot}`,
		title: journal.sessionId
			? `Session ${journal.sessionId}`
			: "Current development evidence",
		generatedAt: journal.generatedAt,
		facts,
		notes: [],
	});
}

function withArtifactQuery(
	journal: EvidenceJournal,
	artifactQuery: string,
): EvidenceJournal {
	return {
		...journal,
		events: journal.events.map((event) => ({
			...event,
			artifacts: event.artifacts.map((artifact) => ({
				...artifact,
				path: `${artifact.path}?${artifactQuery}`,
			})),
		})),
	};
}

export async function startSessionControlServer(
	options: SessionControlServerOptions,
): Promise<SessionControlServer> {
	const token = options.token ?? randomBytes(32).toString("base64url");
	const controlsCapability = randomBytes(24).toString("base64url");
	const reportCapability = randomBytes(24).toString("base64url");
	const controlsOrigins = new Set<string>();
	const control =
		options.control ??
		createLocalSessionControl({ hoboHome: options.hoboHome });
	const evidence = createEvidencePort({
		root: join(options.hoboHome, "durable", "code", "evidence"),
		actor: "principal:local-developer",
		origin: "hobo-code:control-server",
		signingKey: token,
	});
	const replayStore = createFilesystemDualFixtures(
		join(options.hoboHome, "durable", "code", "replay"),
	);
	const replayRecorders = new Map<
		string,
		ReturnType<typeof createDebugReplayRecorder>
	>();
	const recorder = (sessionId: string) => {
		let value = replayRecorders.get(sessionId);
		if (!value) {
			value = createDebugReplayRecorder({
				sessionId,
				...(options.replayLevel ? { level: options.replayLevel } : {}),
				env: process.env,
				correlation: buildCorrelation({
					stationId: "station:local",
					principalRef: "principal:local-developer",
					controlPlaneEventId: `hobo-code:${sessionId}`,
				}),
				store: replayStore.blobs,
				index: replayStore.index,
			});
			replayRecorders.set(sessionId, value);
		}
		return value;
	};
	const runner = sessionProcessRunner();
	const server = createServer(async (request, response) => {
		try {
			const url = new URL(request.url ?? "/", "http://127.0.0.1");
			if (
				request.method === "POST" &&
				url.pathname === `/__hobo/evidence/api/captures/${controlsCapability}`
			) {
				const origin = request.headers.origin;
				if (!origin || !controlsOrigins.has(origin)) {
					json(response, 403, {
						error: "evidence capture origin is not registered",
					});
					return;
				}
				if (origin) response.setHeader("access-control-allow-origin", origin);
				const kind = url.searchParams.get("kind");
				if (kind === "recording-video") {
					const bytes = await requestBytes(request, 64 * 1024 * 1024);
					if (
						!bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
					)
						throw new TypeError("browser recording must be WebM");
					const writer = evidence.beginArtifact({
						title: "Browser recording video",
						mediaType: "video/webm",
					});
					writer.write(bytes);
					const artifact = writer.finish();
					json(response, 201, { ok: true, artifactRef: artifact.id });
					return;
				}
				if (kind === "recording-manifest") {
					const body = (await requestBody(request)) as Record<string, unknown>;
					const manifest = parseBrowserRecording(body.manifest);
					if (typeof body.videoArtifactRef !== "string")
						throw new TypeError("recording video artifact is required");
					evidence.readArtifact(body.videoArtifactRef);
					const bytes = Buffer.from(`${JSON.stringify(manifest)}\n`);
					const writer = evidence.beginArtifact({
						title: "Browser recording actions",
						mediaType: "application/json",
					});
					writer.write(bytes);
					const actions = writer.finish();
					const current = readCurrentSessionContext(options.hoboHome);
					const id = evidence.submit({
						kind: "recording",
						title: manifest.title,
						summary: `${manifest.actions.length} actions and ${manifest.checkpoints.length} state checkpoints captured over ${manifest.durationMs} ms.`,
						subject: current
							? sessionEvidenceSubject(current.sessionId)
							: manifest.id,
						artifactRefs: [body.videoArtifactRef, actions.id],
						sourceRef: manifest.id,
					});
					json(response, 201, {
						ok: true,
						id,
						recordingId: manifest.id,
						artifactRefs: [body.videoArtifactRef, actions.id],
					});
					return;
				}
				if (kind !== "screenshot") {
					json(response, 400, { error: "invalid evidence capture kind" });
					return;
				}
				const bytes = await requestBytes(request, 16 * 1024 * 1024);
				if (
					bytes.length < 8 ||
					!bytes
						.subarray(0, 8)
						.equals(
							Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
						)
				) {
					throw new TypeError("screenshot capture must be PNG");
				}
				const subject = url.searchParams.get("subject") ?? "browser:current";
				if (!subject.trim() || subject.length > 512) {
					throw new TypeError("screenshot subject is invalid");
				}
				const writer = evidence.beginArtifact({
					title: "Browser screenshot",
					mediaType: "image/png",
				});
				writer.write(bytes);
				const artifact = writer.finish();
				const current = readCurrentSessionContext(options.hoboHome);
				const id = evidence.submit({
					kind: "screenshot",
					title: "Browser screenshot",
					summary: `Looked at ${subject} to validate the current work.`,
					subject: current
						? sessionEvidenceSubject(current.sessionId)
						: subject,
					artifactRefs: [artifact.id],
					sourceRef: subject,
				});
				json(response, 201, { ok: true, id, artifactRef: artifact.id });
				return;
			}
			const privilegedReport =
				url.searchParams.get("token") === token || authorized(request, token);
			const readOnlyReport =
				url.searchParams.get("report") === reportCapability;
			if (
				request.method === "GET" &&
				url.pathname === "/__hobo/evidence" &&
				(privilegedReport || readOnlyReport)
			) {
				const artifactQuery = privilegedReport
					? `token=${encodeURIComponent(token)}`
					: `report=${encodeURIComponent(reportCapability)}`;
				const journal = withArtifactQuery(
					currentEvidenceJournal(options.hoboHome, evidence),
					artifactQuery,
				);
				const html = renderEvidenceJournalHtml(journal, {
					live: true,
					journalHref: `/__hobo/evidence/journal?${artifactQuery}`,
					...(privilegedReport
						? { controlsHref: `/?token=${encodeURIComponent(token)}` }
						: {}),
				});
				response.writeHead(200, {
					"cache-control": "no-store",
					"content-security-policy":
						"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self'; media-src 'self'; font-src data:; frame-ancestors 'none'",
					"content-type": "text/html; charset=utf-8",
					"referrer-policy": "no-referrer",
					"x-content-type-options": "nosniff",
				});
				response.end(html);
				return;
			}
			if (
				request.method === "GET" &&
				url.pathname === "/__hobo/evidence/journal" &&
				(privilegedReport || readOnlyReport)
			) {
				const artifactQuery = privilegedReport
					? `token=${encodeURIComponent(token)}`
					: `report=${encodeURIComponent(reportCapability)}`;
				const journal = withArtifactQuery(
					currentEvidenceJournal(options.hoboHome, evidence),
					artifactQuery,
				);
				json(response, 200, {
					...journal,
					events: journal.events.map((event) => ({
						id: event.id,
						html: renderEvidenceJournalEventHtml(event),
					})),
				});
				return;
			}
			if (
				request.method === "POST" &&
				url.pathname === `/__hobo/evidence/api/actions/${controlsCapability}`
			) {
				const origin = request.headers.origin;
				const privileged = authorized(request, token);
				if ((!origin || !controlsOrigins.has(origin)) && !privileged) {
					json(response, 403, {
						error: "evidence action origin is not registered",
					});
					return;
				}
				if (origin) response.setHeader("access-control-allow-origin", origin);
				const message = parseEvidenceOverlayMessage(
					{
						origin: origin ?? "http://127.0.0.1",
						data: await requestBody(request),
					},
					origin ?? "http://127.0.0.1",
				);
				if (message.type === "report") {
					json(response, 200, {
						ok: true,
						url: `http://127.0.0.1:${(server.address() as { port: number }).port}/__hobo/evidence?report=${encodeURIComponent(reportCapability)}`,
					});
					return;
				}
				if (
					message.type === "replay" &&
					typeof message.sessionId === "string"
				) {
					json(
						response,
						200,
						await loadPlayerPayload({
							sessionId: message.sessionId,
							index: replayStore.index,
							blobs: replayStore.blobs,
							stationId: "station:local",
						}),
					);
					return;
				}
				if (message.type === "annotate" || message.type === "edit-request") {
					const current = readCurrentSessionContext(options.hoboHome);
					const id = evidence.submit({
						kind: message.type === "annotate" ? "annotation" : "note",
						title:
							message.type === "annotate"
								? "Browser annotation"
								: "Browser edit request",
						summary:
							message.type === "annotate"
								? String(message.note ?? "")
								: String(message.prompt ?? ""),
						subject: current
							? sessionEvidenceSubject(current.sessionId)
							: message.selector,
						artifactRefs: [],
						sourceRef: message.selector,
					});
					json(response, 202, { ok: true, id });
					return;
				}
				if (message.type === "save-capability") {
					if (!privileged) {
						json(response, 403, {
							error:
								"recording capability export requires controls authorization",
						});
						return;
					}
					const recording = evidence
						.records("recording")
						.find((candidate) => candidate.subject === message.recordingId);
					if (!recording)
						throw new TypeError("recording evidence was not found");
					const sourceArtifactRef = recording.artifactRefs.find(
						(ref) => evidence.artifact(ref)?.mediaType === "application/json",
					);
					if (!sourceArtifactRef)
						throw new Error("recording action artifact is missing");
					const manifest = parseBrowserRecording(
						JSON.parse(
							Buffer.from(
								evidence.readArtifact(sourceArtifactRef).bytes,
							).toString("utf8"),
						),
					);
					const exported = exportEvidenceRecordingAutomation(manifest, {
						name: message.name,
						sourceArtifactRef,
					});
					saveRecordingCapability(options.projectRoot, exported);
					const artifactRefs = exported.artifacts.map((generated) => {
						const writer = evidence.beginArtifact({
							title: generated.path,
							mediaType: generated.mediaType,
						});
						writer.write(Buffer.from(generated.contents));
						return writer.finish().id;
					});
					const id = evidence.submit({
						kind: "feature",
						title: `Reusable capability: ${exported.capabilityId}`,
						summary: `${manifest.actions.length} recorded actions compiled to agent instructions and deterministic Playwright automation (${exported.replayability}).`,
						subject: `capability:${exported.capabilityId}`,
						artifactRefs,
						sourceRef: sourceArtifactRef,
					});
					json(response, 201, {
						ok: true,
						id,
						capabilityId: exported.capabilityId,
						path: `.hobo/recordings/${exported.capabilityId}`,
						command: exported.commands[0],
						replayability: exported.replayability,
						requiredEnvironment: exported.requiredEnvironment,
						artifactRefs,
					});
					return;
				}
				json(response, 400, { error: "invalid evidence overlay action" });
				return;
			}
			if (
				request.method === "GET" &&
				url.pathname === `/__hobo/evidence/controls/${controlsCapability}`
			) {
				const parentOrigin = url.searchParams.get("parentOrigin");
				if (!parentOrigin) {
					json(response, 400, { error: "missing parent origin" });
					return;
				}
				const registeredOrigin = new URL(parentOrigin).origin;
				if (registeredOrigin !== parentOrigin) {
					json(response, 400, { error: "invalid parent origin" });
					return;
				}
				controlsOrigins.add(registeredOrigin);
				response.writeHead(200, {
					"cache-control": "no-store",
					"content-type": "text/html; charset=utf-8",
					"referrer-policy": "no-referrer",
					"x-content-type-options": "nosniff",
				});
				const sessionId = url.searchParams.get("sessionId");
				response.end(
					renderEvidenceOverlayControls({
						parentOrigin,
						reportUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}/__hobo/evidence?report=${encodeURIComponent(reportCapability)}`,
						...(sessionId ? { sessionId } : {}),
						capabilityAuthorization: `Bearer ${token}`,
					}),
				);
				return;
			}
			const artifactMatch = /^\/__hobo\/assets\/sha256\/([a-f0-9]{64})$/u.exec(
				url.pathname,
			);
			if (
				request.method === "GET" &&
				artifactMatch &&
				(url.searchParams.get("token") === token ||
					url.searchParams.get("report") === reportCapability ||
					authorized(request, token))
			) {
				const artifact = evidence.readArtifact(`sha256:${artifactMatch[1]}`);
				if (!artifact) {
					json(response, 404, { error: "evidence artifact not found" });
					return;
				}
				response.writeHead(200, {
					"cache-control": "private, immutable",
					"content-length": String(artifact.bytes.byteLength),
					"content-type": artifact.mediaType,
					"x-content-type-options": "nosniff",
				});
				response.end(artifact.bytes);
				return;
			}
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
			if (request.method === "POST" && url.pathname === "/code/evidence") {
				const id = evidence.submit(await requestBody(request));
				const record = evidence
					.records()
					.find((candidate) => candidate.id === id);
				if (!record) throw new Error("stored evidence record is missing");
				json(response, 200, record);
				return;
			}
			const replayMatch = /^\/code\/sessions\/([^/]+)\/replay$/u.exec(
				url.pathname,
			);
			if (request.method === "GET" && replayMatch) {
				const sessionId = decodeURIComponent(replayMatch[1] ?? "");
				await recorder(sessionId).flush();
				json(
					response,
					200,
					await loadPlayerPayload({
						sessionId,
						index: replayStore.index,
						blobs: replayStore.blobs,
						stationId: "station:local",
					}),
				);
				return;
			}
			if (request.method === "POST" && replayMatch) {
				const sessionId = decodeURIComponent(replayMatch[1] ?? "");
				const body = (await requestBody(request)) as Record<string, unknown>;
				if (
					typeof body.track !== "string" ||
					![
						"browser",
						"terminal",
						"agent",
						"git",
						"test",
						"annotation",
						"approval",
					].includes(body.track)
				) {
					throw new TypeError("invalid debug replay track");
				}
				const accepted = recorder(sessionId).record({
					track: body.track as Parameters<
						ReturnType<typeof recorder>["record"]
					>[0]["track"],
					metadata:
						typeof body.metadata === "object" && body.metadata !== null
							? (body.metadata as Record<string, unknown>)
							: {},
					observable:
						typeof body.observable === "object" && body.observable !== null
							? (body.observable as Record<string, unknown>)
							: {},
				});
				await recorder(sessionId).flush();
				json(response, 202, { accepted, level: recorder(sessionId).level });
				return;
			}
			if (
				request.method === "GET" &&
				url.pathname === "/__hobo/evidence/api/report"
			) {
				json(
					response,
					200,
					currentEvidenceReport(
						options.hoboHome,
						options.projectRoot,
						evidence,
					),
				);
				return;
			}
			if (
				request.method === "GET" &&
				url.pathname === "/__hobo/evidence/api/export"
			) {
				json(
					response,
					200,
					renderEvidenceReportExport(
						currentEvidenceReport(
							options.hoboHome,
							options.projectRoot,
							evidence,
						),
						(id) => evidence.readArtifact(id).bytes,
					),
				);
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
				const sessionId = decodeURIComponent(paneOutput[1] ?? "");
				const paneId = decodeURIComponent(paneOutput[2] ?? "");
				const output = await control.capturePane(sessionId, paneId, lines);
				recorder(sessionId).record({
					track: "terminal",
					metadata: { paneId, lines },
					observable: { output },
				});
				json(response, 200, { output });
				return;
			}
			const gitWorkbench = /^\/code\/sessions\/([^/]+)\/git$/u.exec(
				url.pathname,
			);
			if (request.method === "GET" && gitWorkbench) {
				const snapshot = await control.load(
					decodeURIComponent(gitWorkbench[1] ?? ""),
				);
				if (!snapshot?.session) {
					json(response, 404, { error: "session not found" });
					return;
				}
				const kind = url.searchParams.get("kind");
				const value = url.searchParams.get("value");
				const selection: GitSelection | undefined =
					kind && value && ["file", "branch", "commit", "stash"].includes(kind)
						? { kind: kind as GitSelection["kind"], value }
						: undefined;
				if ((kind || value) && !selection) {
					json(response, 400, { error: "invalid Git workbench selection" });
					return;
				}
				json(
					response,
					200,
					await readGitWorkbenchSnapshot(
						snapshot.session.worktreePath,
						runner,
						selection,
					),
				);
				return;
			}
			const gitAction = /^\/code\/sessions\/([^/]+)\/git\/actions$/u.exec(
				url.pathname,
			);
			if (request.method === "POST" && gitAction) {
				const snapshot = await control.load(
					decodeURIComponent(gitAction[1] ?? ""),
				);
				if (!snapshot?.session) {
					json(response, 404, { error: "session not found" });
					return;
				}
				await runGitWorkbenchAction(
					snapshot.session.worktreePath,
					runner,
					parseGitWorkbenchAction(await requestBody(request)),
				);
				json(response, 200, { ok: true });
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
	const controlsUrlTemplate = `http://127.0.0.1:${address.port}/__hobo/evidence/controls/${controlsCapability}`;
	const discoveryPath = join(
		options.hoboHome,
		"runtime",
		"code",
		"evidence-controls-url",
	);
	mkdirSync(join(options.hoboHome, "runtime", "code"), { recursive: true });
	writeFileSync(discoveryPath, `${controlsUrlTemplate}\n`, { mode: 0o600 });
	return {
		port: address.port,
		token,
		url: `http://127.0.0.1:${address.port}/?token=${encodeURIComponent(token)}`,
		reportUrl: `http://127.0.0.1:${address.port}/__hobo/evidence?token=${encodeURIComponent(token)}`,
		controlsUrlTemplate,
		controlsUrl: (parentOrigin, sessionId) => {
			const url = new URL(
				`http://127.0.0.1:${address.port}/__hobo/evidence/controls/${controlsCapability}`,
			);
			url.searchParams.set("parentOrigin", parentOrigin);
			if (sessionId) url.searchParams.set("sessionId", sessionId);
			return url.href;
		},
		close: () =>
			Promise.all(
				[...replayRecorders.values()].map((value) => value.stop()),
			).then(
				() =>
					new Promise<void>((resolve, reject) => {
						server.close((error) => {
							if (
								existsSync(discoveryPath) &&
								readFileSync(discoveryPath, "utf8").trim() ===
									controlsUrlTemplate
							) {
								unlinkSync(discoveryPath);
							}
							control.close();
							if (error) reject(error);
							else resolve();
						});
					}),
			),
	};
}
