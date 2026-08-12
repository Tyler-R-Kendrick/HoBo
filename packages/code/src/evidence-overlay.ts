export type EvidenceOverlayMessage =
	| {
			readonly type: "annotate";
			readonly selector: string;
			readonly note: string;
	  }
	| {
			readonly type: "capture";
			readonly kind: "screenshot";
	  }
	| { readonly type: "record"; readonly action: "start" | "stop" }
	| {
			readonly type: "save-capability";
			readonly recordingId: string;
			readonly name: string;
	  }
	| { readonly type: "report" }
	| { readonly type: "replay"; readonly sessionId?: string }
	| {
			readonly type: "edit-request";
			readonly selector: string;
			readonly prompt: string;
	  };

export interface EvidenceOverlayMessageEvent {
	readonly origin: string;
	readonly data: unknown;
}

export interface EvidenceOverlayBridgeOptions {
	readonly controlsUrl: string;
}

export interface EvidenceOverlayControlsOptions {
	readonly parentOrigin: string;
	readonly sessionId?: string;
}

export interface EvidenceOverlayWrapperOptions {
	readonly appUrl: string;
	readonly controlsUrl: string;
}

const BRIDGE_CSS = `
:host{all:initial;position:fixed;z-index:2147483647;right:1rem;bottom:1rem;color:#101010;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
*{box-sizing:border-box}
button{font:400 1rem/1 Chewy,"Arial Rounded MT Bold",system-ui,sans-serif}
.launcher{min-height:2.75rem;padding:.7rem 1rem;border:3px solid #101010;border-radius:4px;background:#fff;color:#101010;box-shadow:4px 4px 0 #101010;cursor:pointer;letter-spacing:.04em;transform:rotate(-1deg)}
.launcher:hover{background:#c5301c;color:#fff}
.launcher:focus-visible{outline:3px solid #c5301c;outline-offset:4px}
.launcher[aria-expanded="true"]{display:none}
.panel{position:absolute;right:0;bottom:0;width:min(26rem,calc(100vw - 2rem));height:min(42rem,calc(100vh - 2rem));overflow:hidden;border:3px solid #101010;border-radius:18px 18px 4px 18px;background:#fff;box-shadow:6px 6px 0 #101010;transform-origin:bottom right;animation:hobo-evidence-in 160ms cubic-bezier(.16,1,.3,1)}
.panel[hidden]{display:none}
iframe{display:block;width:100%;height:100%;border:0;background:#fff}
.status{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
@keyframes hobo-evidence-in{from{opacity:.75;transform:translateY(.5rem) scale(.98)}to{opacity:1;transform:none}}
@media (max-width: 42rem){:host{right:.75rem;bottom:.75rem}.panel{position:fixed;inset:auto .5rem .5rem;height:min(72vh,42rem);width:auto;border-radius:18px 18px 4px 4px}}
@media (prefers-reduced-motion: reduce){.panel{animation:none}.launcher{scroll-behavior:auto}}
`;

const BROWSER_MESSAGE_PARSER = `
const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const exact = (value, required, optional = []) => {
  const keys = Object.keys(value);
  return required.every((key) => keys.includes(key)) && keys.every((key) => required.includes(key) || optional.includes(key));
};
const text = (value, maximum) => typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
const parse = (value) => {
  if (!isRecord(value)) return null;
  if (value.type === "annotate" && exact(value, ["type", "selector", "note"]) && text(value.selector, 2048) && text(value.note, 8192)) return value;
  if (value.type === "capture" && exact(value, ["type", "kind"]) && value.kind === "screenshot") return value;
  if (value.type === "record" && exact(value, ["type", "action"]) && (value.action === "start" || value.action === "stop")) return value;
  if (value.type === "save-capability" && exact(value, ["type", "recordingId", "name"]) && text(value.recordingId, 256) && text(value.name, 256)) return value;
  if (value.type === "report" && exact(value, ["type"])) return value;
  if (value.type === "replay" && exact(value, ["type"], ["sessionId"]) && (value.sessionId === undefined || text(value.sessionId, 256))) return value;
  if (value.type === "edit-request" && exact(value, ["type", "selector", "prompt"]) && text(value.selector, 2048) && text(value.prompt, 8192)) return value;
  return null;
};`;

const BROWSER_CAPTURE_RUNTIME = `
let evidenceRecording;
const captureUrl = (kind) => new URL("/__hobo/evidence/api/captures/" + controlsUrl.pathname.split("/").pop() + "?kind=" + kind + "&subject=" + encodeURIComponent("browser:" + location.href), controlsUrl);
const resultToControls = (command, ok, result) => frame.contentWindow?.postMessage({ type: "evidence-result", detail: { command, ok, result } }, controlsOrigin);
const targetFor = (element) => {
  if (!(element instanceof Element)) return {};
  const label = element.labels?.[0]?.textContent?.trim();
  const role = element.getAttribute("role") || ({BUTTON:"button",A:"link",INPUT:element.type==="checkbox"?"checkbox":"textbox",TEXTAREA:"textbox",SELECT:"combobox"})[element.tagName];
  const name = element.getAttribute("aria-label") || element.textContent?.trim().replace(/\\s+/g," ").slice(0,128);
  const testId = element.getAttribute("data-testid") || undefined;
  const stableId = element.id || undefined;
  const css = !role && !label && !testId && !stableId ? element.tagName.toLowerCase() + (element.classList.length ? "." + [...element.classList].slice(0,2).map(value => CSS.escape(value)).join(".") : "") : undefined;
  return { ...(role?{role}:{}), ...(name?{name}:{}), ...(label?{label}:{}), ...(testId?{testId}:{}), ...(stableId?{stableId}:{}), ...(css?{css}:{}) };
};
const pngBlob = async () => {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: "browser" }, audio: false, preferCurrentTab: true });
  try {
    const video = document.createElement("video"); video.srcObject = stream; video.muted = true; await video.play();
    const canvas = document.createElement("canvas"); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error("screenshot encoding failed")), "image/png"));
  } finally { stream.getTracks().forEach(track => track.stop()); }
};
const captureScreenshot = async (command) => {
  host.style.visibility = "hidden";
  try {
    const blob = await pngBlob();
    const response = await fetch(captureUrl("screenshot"), { method: "POST", body: blob, credentials: "omit" });
    const result = await response.json(); resultToControls(command, response.ok, result); status.textContent = response.ok ? "Screenshot saved to Evidence." : result.error || "Screenshot failed";
  } catch (error) { const result={error:String(error)}; resultToControls(command,false,result); status.textContent="Screenshot permission was denied or capture failed"; }
  finally { host.style.visibility = ""; }
};
const startRecording = async (command) => {
  if (evidenceRecording) throw Error("a browser recording is already active");
  const startUrl=location.href;
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: "browser" }, audio: false, preferCurrentTab: true });
  const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm" });
  const chunks=[]; const actions=[]; const checkpoints=[]; const started=Date.now(); let sequence=0; let lastPointer=0; let stopped=false;
  const add=(action)=>actions.push({sequence:++sequence,offsetMs:Date.now()-started,...action});
  const checkpoint=()=>checkpoints.push({sequence:checkpoints.length+1,afterAction:sequence,path:location.pathname+location.search+location.hash,title:document.title.slice(0,512)});
  const click=(event)=>{add({type:"click",target:targetFor(event.target)});queueMicrotask(checkpoint)};
  const input=(event)=>{const element=event.target;if(!(element instanceof Element))return;const hint=(element.getAttribute("name")||element.id||"INPUT").replace(/[^A-Za-z0-9]+/g,"_").toUpperCase().slice(0,64)||"INPUT";add({type:"fill",target:targetFor(element),value:{kind:"parameter",name:hint}});queueMicrotask(checkpoint)};
  const key=(event)=>{if(event.key.length===1)return;add({type:"press",target:targetFor(event.target),key:event.key});queueMicrotask(checkpoint)};
  const pointer=(event)=>{if(Date.now()-lastPointer<250)return;lastPointer=Date.now();add({type:"pointer",x:Math.round(event.clientX),y:Math.round(event.clientY)})};
  const scroll=()=>add({type:"scroll",x:Math.round(scrollX),y:Math.round(scrollY)});
  const listeners=[[document,"click",click,true],[document,"change",input,true],[document,"keydown",key,true],[document,"pointermove",pointer,true],[window,"scroll",scroll,true]];
  listeners.forEach(([node,type,listener,options])=>node.addEventListener(type,listener,options));
  recorder.ondataavailable=(event)=>{if(event.data.size)chunks.push(event.data)}; recorder.start(1000); checkpoint();
  const stop=async(statusValue="completed")=>{
    if(stopped)return;stopped=true;listeners.forEach(([node,type,listener,options])=>node.removeEventListener(type,listener,options));
    const finished=new Promise(resolve=>recorder.addEventListener("stop",resolve,{once:true})); recorder.stop(); await finished; stream.getTracks().forEach(track=>track.stop());
    const video=new Blob(chunks,{type:recorder.mimeType||"video/webm"});
    const videoResponse=await fetch(captureUrl("recording-video"),{method:"POST",body:video,credentials:"omit"});const videoResult=await videoResponse.json();if(!videoResponse.ok)throw Error(videoResult.error||"video upload failed");
    const manifest={schemaVersion:"hobo.code.browser-recording/v1",id:crypto.randomUUID(),title:document.title||"Browser recording",status:statusValue,startUrl,endUrl:location.href,durationMs:Date.now()-started,viewport:{width:innerWidth,height:innerHeight},actions,checkpoints};
    const response=await fetch(captureUrl("recording-manifest"),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({manifest,videoArtifactRef:videoResult.artifactRef}),credentials:"omit"});const result=await response.json();resultToControls({type:"record",action:"stop"},response.ok,result);status.textContent=response.ok?"Recording saved to Evidence.":result.error||"Recording failed";return result;
  };
  stream.getVideoTracks()[0]?.addEventListener("ended",()=>stop("interrupted").catch(()=>{}),{once:true});
  evidenceRecording={stop}; recordingStop.hidden=false; setOpen(false); recordingStop.focus(); resultToControls(command,true,{recording:true}); status.textContent="Recording actions and state changes.";
};
const stopRecording = async () => { if(!evidenceRecording)throw Error("no browser recording is active");const current=evidenceRecording;evidenceRecording=undefined;recordingStop.disabled=true;try{return await current.stop()}finally{recordingStop.hidden=true;recordingStop.disabled=false;setOpen(true)} };
`;

function absoluteHttpUrl(value: string, label: string): URL {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error(`evidence overlay ${label} must be an absolute URL`);
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new Error(`evidence overlay ${label} must use HTTP(S)`);
	}
	return url;
}

function scriptJson(value: unknown): string {
	return JSON.stringify(value)
		.replaceAll("<", "\\u003c")
		.replaceAll("\u2028", "\\u2028")
		.replaceAll("\u2029", "\\u2029");
}

/**
 * Render the capability-limited page bridge. Privileged fetches stay inside
 * the separate-origin controls frame; the host page receives no credential.
 */
export function renderEvidenceOverlayBridge(
	options: EvidenceOverlayBridgeOptions,
): string {
	const controlsUrl = absoluteHttpUrl(options.controlsUrl, "controls URL");
	return `(() => {
"use strict";
const controlsUrl = new URL(${scriptJson(controlsUrl.href)});
const controlsOrigin = controlsUrl.origin;
if (controlsOrigin === window.location.origin) throw new Error("HoBo evidence controls require a separate origin");
if (document.querySelector("[data-hobo-evidence-overlay]")) return;
const host = document.createElement("div");
host.dataset.hoboEvidenceOverlay = "";
const shadow = host.attachShadow({ mode: "closed" });
shadow.innerHTML = ${scriptJson(`<style>${BRIDGE_CSS}</style>
<button class="launcher" type="button" aria-label="Open HoBo evidence controls" aria-expanded="false" aria-controls="hobo-evidence-controls">HoBo evidence</button>
<button class="launcher recording-stop" type="button" hidden>Recording · Stop</button><section class="panel" id="hobo-evidence-controls" aria-label="HoBo evidence controls" hidden><iframe title="HoBo evidence controls" sandbox="allow-forms allow-scripts allow-same-origin" referrerpolicy="no-referrer"></iframe></section>
<p class="status" role="status" aria-live="polite"></p>`)};
const launcher = shadow.querySelector(".launcher");
const panel = shadow.querySelector(".panel");
const frame = shadow.querySelector("iframe");
const status = shadow.querySelector(".status");
const recordingStop = shadow.querySelector(".recording-stop");
frame.src = controlsUrl.href;
const setOpen = (open) => {
  panel.hidden = !open;
  launcher.setAttribute("aria-expanded", String(open));
  launcher.setAttribute("aria-label", open ? "Close HoBo evidence controls" : "Open HoBo evidence controls");
  if (open) frame.focus(); else launcher.focus();
};
launcher.addEventListener("click", () => setOpen(panel.hidden));
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !panel.hidden) setOpen(false);
});
frame.addEventListener("load", () => { status.textContent = "HoBo evidence controls ready"; });
${BROWSER_MESSAGE_PARSER}
${BROWSER_CAPTURE_RUNTIME}
recordingStop.addEventListener("click",()=>stopRecording().catch(error=>{status.textContent=String(error)}));
window.addEventListener("message", (event) => {
  if (event.origin !== controlsOrigin || event.source !== frame.contentWindow) return;
  if (isRecord(event.data) && exact(event.data, ["type"]) && event.data.type === "overlay-close") { setOpen(false); return; }
  const message = parse(event.data);
  if (!message) { status.textContent = "HoBo evidence refused an invalid command"; return; }
  if (message.type === "capture") { captureScreenshot(message); return; }
  if (message.type === "record") { (message.action === "start" ? startRecording(message) : stopRecording()).catch(error => { resultToControls(message,false,{error:String(error)}); status.textContent=String(error); }); return; }
  if (message.type === "annotate") {
    let target;
    try { target = document.querySelector(message.selector); } catch { status.textContent = "HoBo evidence refused an invalid selector"; return; }
    if (!target) { status.textContent = "HoBo evidence could not find that element"; return; }
    target.dataset.hoboEvidenceAnnotation = message.note;
    target.style.outline = "3px solid #c5301c";
    target.style.outlineOffset = "3px";
    status.textContent = "HoBo evidence pinned the annotation";
  }
  window.dispatchEvent(new CustomEvent("hobo:evidence-overlay", { detail: message }));
  fetch(new URL("/__hobo/evidence/api/actions/" + controlsUrl.pathname.split("/").pop(), controlsUrl), { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify(message), credentials: "omit" })
    .then(async (response) => { const result = await response.json(); window.dispatchEvent(new CustomEvent("hobo:evidence-result", { detail: { command: message, ok: response.ok, result } })); if (response.ok && typeof result.url === "string") window.open(result.url, "_blank", "noopener,noreferrer"); status.textContent = response.ok ? "HoBo evidence action completed" : "HoBo evidence action failed"; })
    .catch(() => { status.textContent = "HoBo evidence runtime is unavailable"; });
});
document.documentElement.append(host);
})();`;
}

/** Render the controls document hosted by the privileged control origin. */
export function renderEvidenceOverlayControls(
	options: EvidenceOverlayControlsOptions,
): string {
	const parentOrigin = trustedOrigin(options.parentOrigin, "parent origin");
	const sessionId =
		options.sessionId === undefined
			? undefined
			: boundedString(options.sessionId, "sessionId", 256);
	const config = scriptJson({ parentOrigin, sessionId });
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'none'; base-uri 'none'">
<title>HoBo evidence controls</title><style>
:root{color-scheme:light;--ink:#101010;--paper:#fff;--cream:#f2f1ec;--mute:#4a4a46;--spark:#c5301c;--go:#14672c}
*{box-sizing:border-box}body{margin:0;padding:1rem;background:var(--paper);color:var(--ink);font:1rem/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}h1,h2,button{font-family:Chewy,"Arial Rounded MT Bold",system-ui,sans-serif;font-weight:400}h1{margin:0;font-size:1.8rem;line-height:1.1;letter-spacing:.01em;text-shadow:2px 2px 0 #e3e2de;transform:rotate(-1deg)}h2{margin:.25rem 0;font-size:1.35rem}p{margin:.35rem 0 1rem;color:var(--mute)}header{display:flex;align-items:start;justify-content:space-between;gap:1rem;border-bottom:3px solid var(--ink);padding-bottom:.85rem}.close{flex:0 0 auto}.action-group{margin:1rem 0}.action-group>h2{font-family:system-ui,sans-serif;font-size:.75rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.65rem}button,input,textarea{font:inherit}button{min-height:2.75rem;border:3px solid var(--ink);border-radius:4px;background:var(--paper);color:var(--ink);box-shadow:3px 3px 0 var(--ink);font-family:Chewy,"Arial Rounded MT Bold",system-ui,sans-serif;font-size:1.05rem;cursor:pointer;transform:rotate(-.5deg)}button:nth-child(even){transform:rotate(.5deg)}button:hover{background:var(--spark);color:#fff}button:active{transform:translate(2px,2px);box-shadow:1px 1px 0 var(--ink)}button:focus-visible,input:focus-visible,textarea:focus-visible{outline:3px solid var(--spark);outline-offset:3px}form{margin-top:1rem;padding-top:1rem;border-top:2px solid var(--ink)}label{display:block;margin:.65rem 0 .25rem;font-size:.8rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase}input,textarea{width:100%;border:2px solid var(--ink);border-radius:4px;padding:.65rem;background:var(--cream);color:var(--ink)}textarea{min-height:5.5rem;resize:vertical}form button{width:100%;margin-top:.75rem;background:var(--ink);color:#fff}.status{min-height:1.5rem;margin-top:1rem;color:var(--go);font-weight:700}
@media (max-width: 32rem){body{padding:.75rem}.actions{grid-template-columns:1fr}h1{font-size:1.4rem}}
@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important;scroll-behavior:auto!important}button:active{transform:none}}
</style></head><body>
<header><div><h1>Evidence desk</h1><p>Capture what happened. Review before changing code.</p></div><button class="close" type="button" data-close aria-label="Close HoBo evidence controls">Close</button></header>
<main><section class="action-group" aria-labelledby="inspect-title"><h2 id="inspect-title">Inspect</h2><div class="actions">
<button type="button" data-command="report">Open report</button><button type="button" data-command="replay">Replay session</button></div></section>
<section class="action-group" aria-labelledby="capture-title"><h2 id="capture-title">Capture</h2><div class="actions">
<button type="button" data-command="screenshot">Screenshot</button><button type="button" data-command="record">Record</button><button type="button" data-command="stop" hidden>Stop</button><button type="button" data-command="capability" hidden>Save as capability…</button></div></section>
<form id="annotate"><h2>Annotate</h2><label for="annotation-selector">Element selector</label><input id="annotation-selector" name="selector" required maxlength="2048" autocomplete="off"><label for="annotation-note">Note</label><textarea id="annotation-note" name="note" required maxlength="8192"></textarea><button type="submit">Pin annotation</button></form>
<form id="edit"><h2>Request an edit</h2><label for="edit-selector">Element selector</label><input id="edit-selector" name="selector" required maxlength="2048" autocomplete="off"><label for="edit-prompt">Requested change</label><textarea id="edit-prompt" name="prompt" required maxlength="8192"></textarea><button type="submit">Review edit request</button></form>
<p class="status" role="status" aria-live="polite"></p></main>
<script>const cfg=${config};const parentOrigin=cfg.parentOrigin;const status=document.querySelector(".status");const record=document.querySelector('[data-command="record"]');const stop=document.querySelector('[data-command="stop"]');const capability=document.querySelector('[data-command="capability"]');let recordingId;const labels={report:"Opening evidence report…",replay:"Opening session replay…",screenshot:"Capturing screenshot…",record:"Recording actions, navigation, and state changes.",stop:"Saving recording…",annotate:"Pinning annotation…",edit:"Sending edit for review…"};const post=(message,label)=>{window.parent.postMessage(message,parentOrigin);status.textContent=labels[label]};document.querySelector("[data-close]").addEventListener("click",()=>window.parent.postMessage({type:"overlay-close"},parentOrigin));document.querySelectorAll("[data-command]").forEach((button)=>button.addEventListener("click",()=>{const command=button.dataset.command;if(command==="report")post({type:"report"},command);else if(command==="replay")post(cfg.sessionId?{type:"replay",sessionId:cfg.sessionId}:{type:"replay"},command);else if(command==="screenshot")post({type:"capture",kind:"screenshot"},command);else if(command==="record"){post({type:"record",action:"start"},command);record.hidden=true;stop.hidden=false}else if(command==="stop"){post({type:"record",action:"stop"},command);stop.disabled=true}else if(command==="capability"&&recordingId){const name=prompt("Capability name");if(name)post({type:"save-capability",recordingId,name},command)}}));window.addEventListener("message",(event)=>{if(event.origin!==parentOrigin||!event.data||event.data.type!=="evidence-result")return;const detail=event.data.detail;if(detail?.command?.type==="record"&&detail.command.action==="stop"&&detail.ok){recordingId=detail.result?.recordingId;stop.hidden=true;stop.disabled=false;capability.hidden=!recordingId;status.textContent="Recording saved to Evidence."}});document.querySelector("#annotate").addEventListener("submit",(event)=>{event.preventDefault();const data=new FormData(event.currentTarget);post({type:"annotate",selector:String(data.get("selector")||""),note:String(data.get("note")||"")},"annotate")});document.querySelector("#edit").addEventListener("submit",(event)=>{event.preventDefault();const data=new FormData(event.currentTarget);post({type:"edit-request",selector:String(data.get("selector")||""),prompt:String(data.get("prompt")||"")},"edit")});window.addEventListener("keydown",(event)=>{if(event.key==="Escape")window.parent.postMessage({type:"overlay-close"},parentOrigin)});</script></body></html>`;
}

/** Render the no-injection fallback with the app and controls as sibling frames. */
export function renderEvidenceOverlayWrapper(
	options: EvidenceOverlayWrapperOptions,
): string {
	const appUrl = absoluteHttpUrl(options.appUrl, "application URL");
	const controlsUrl = absoluteHttpUrl(options.controlsUrl, "controls URL");
	if (appUrl.origin === controlsUrl.origin) {
		throw new Error("evidence overlay controls require a separate origin");
	}
	const config = scriptJson({
		appUrl: appUrl.href,
		controlsUrl: controlsUrl.href,
	});
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>HoBo evidence workspace</title><style>
html,body,.app{width:100%;height:100%;margin:0;border:0}.launcher{position:fixed;z-index:2;right:1rem;bottom:1rem;min-height:2.75rem;padding:.7rem 1rem;border:3px solid #101010;border-radius:4px;background:#fff;color:#101010;box-shadow:4px 4px 0 #101010;font:400 1rem/1 Chewy,"Arial Rounded MT Bold",system-ui,sans-serif;cursor:pointer;transform:rotate(-1deg)}.launcher:hover{background:#c5301c;color:#fff}.launcher:focus-visible{outline:3px solid #c5301c;outline-offset:4px}.launcher[aria-expanded="true"]{display:none}.controls-shell{position:fixed;z-index:1;right:1rem;bottom:1rem;width:min(26rem,calc(100vw - 2rem));height:min(42rem,calc(100vh - 2rem));border:3px solid #101010;border-radius:18px 18px 4px 18px;background:#fff;box-shadow:6px 6px 0 #101010;overflow:hidden}.controls-shell[hidden]{display:none}.controls{width:100%;height:100%;border:0}
@media (max-width: 42rem){.launcher{right:.75rem;bottom:.75rem}.controls-shell{inset:auto .5rem .5rem;height:min(72vh,42rem);width:auto;border-radius:18px 18px 4px 4px}}
@media (prefers-reduced-motion: reduce){*{scroll-behavior:auto!important}}
</style></head><body><iframe class="app" title="Development application" referrerpolicy="no-referrer"></iframe><button class="launcher" type="button" aria-label="Open HoBo evidence controls" aria-expanded="false" aria-controls="hobo-evidence-wrapper-controls">HoBo evidence</button><section class="controls-shell" id="hobo-evidence-wrapper-controls" hidden><iframe class="controls" title="HoBo evidence controls" sandbox="allow-forms allow-scripts allow-same-origin" referrerpolicy="no-referrer"></iframe></section><script>
const cfg=${config};const controlsUrl=new URL(cfg.controlsUrl);const controlsOrigin=controlsUrl.origin;const app=document.querySelector(".app");const controls=document.querySelector(".controls");const shell=document.querySelector(".controls-shell");const launcher=document.querySelector(".launcher");app.src=cfg.appUrl;controls.src=cfg.controlsUrl;const setOpen=(open)=>{shell.hidden=!open;launcher.setAttribute("aria-expanded",String(open));launcher.setAttribute("aria-label",open?"Close HoBo evidence controls":"Open HoBo evidence controls");if(open)controls.focus();else launcher.focus()};launcher.addEventListener("click",()=>setOpen(shell.hidden));window.addEventListener("keydown",(event)=>{if(event.key==="Escape"&&!shell.hidden)setOpen(false)});${BROWSER_MESSAGE_PARSER}window.addEventListener("message",(event)=>{if(event.origin !== controlsOrigin || event.source !== controls.contentWindow)return;if(isRecord(event.data)&&exact(event.data,["type"])&&event.data.type==="overlay-close"){setOpen(false);return}const message=parse(event.data);if(!message)return;app.contentWindow?.postMessage(message,new URL(cfg.appUrl).origin);window.dispatchEvent(new CustomEvent("hobo:evidence-overlay",{detail:message}));fetch(new URL("/__hobo/evidence/api/actions/"+controlsUrl.pathname.split("/").pop(),controlsUrl),{method:"POST",headers:{"content-type":"text/plain"},body:JSON.stringify(message),credentials:"omit"}).then(async(response)=>{const result=await response.json();if(response.ok&&typeof result.url==="string")window.open(result.url,"_blank","noopener,noreferrer")}).catch(()=>{})});
</script></body></html>`;
}

function trustedOrigin(value: string, label = "origin"): string {
	const url = absoluteHttpUrl(value, label);
	if (url.origin !== value) {
		throw new Error(
			`evidence overlay ${label} must be an exact HTTP(S) origin`,
		);
	}
	return url.origin;
}

function record(value: unknown): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error("evidence overlay message must be an object");
	}
	return value as Record<string, unknown>;
}

function exactFields(
	value: Record<string, unknown>,
	required: readonly string[],
	optional: readonly string[] = [],
): void {
	const allowed = new Set([...required, ...optional]);
	if (
		required.some((key) => !(key in value)) ||
		Object.keys(value).some((key) => !allowed.has(key))
	) {
		throw new Error("evidence overlay message has invalid fields");
	}
}

function boundedString(value: unknown, field: string, maximum: number): string {
	if (
		typeof value !== "string" ||
		value.trim().length === 0 ||
		value.length > maximum
	) {
		throw new Error(`evidence overlay ${field} length is invalid`);
	}
	return value;
}

/** Parse the only commands the unprivileged page bridge may receive. */
export function parseEvidenceOverlayMessage(
	event: EvidenceOverlayMessageEvent,
	controlsOrigin: string,
): EvidenceOverlayMessage {
	if (event.origin !== trustedOrigin(controlsOrigin)) {
		throw new Error("evidence overlay message origin is not trusted");
	}

	const value = record(event.data);
	switch (value.type) {
		case "annotate":
			exactFields(value, ["type", "selector", "note"]);
			return {
				type: "annotate",
				selector: boundedString(value.selector, "selector", 2_048),
				note: boundedString(value.note, "note", 8_192),
			};
		case "capture":
			exactFields(value, ["type", "kind"]);
			if (value.kind !== "screenshot") {
				throw new Error("evidence overlay capture kind is invalid");
			}
			return { type: "capture", kind: value.kind };
		case "record":
			exactFields(value, ["type", "action"]);
			if (value.action !== "start" && value.action !== "stop")
				throw new Error("evidence overlay recording action is invalid");
			return { type: "record", action: value.action };
		case "save-capability":
			exactFields(value, ["type", "recordingId", "name"]);
			return {
				type: "save-capability",
				recordingId: boundedString(value.recordingId, "recordingId", 256),
				name: boundedString(value.name, "name", 256),
			};
		case "report":
			exactFields(value, ["type"]);
			return { type: "report" };
		case "replay":
			exactFields(value, ["type"], ["sessionId"]);
			return value.sessionId === undefined
				? { type: "replay" }
				: {
						type: "replay",
						sessionId: boundedString(value.sessionId, "sessionId", 256),
					};
		case "edit-request":
			exactFields(value, ["type", "selector", "prompt"]);
			return {
				type: "edit-request",
				selector: boundedString(value.selector, "selector", 2_048),
				prompt: boundedString(value.prompt, "prompt", 8_192),
			};
		default:
			throw new Error("evidence overlay message type is invalid");
	}
}
