import { readFileSync } from "node:fs";

import { DESIGN_COLOR_TOKENS } from "./tui-tokens.js";

const {
	ink,
	paper,
	mute,
	cream,
	spark,
	go,
	soot,
	faint,
	border,
	borderStrong,
	inset,
	codeBg,
} = DESIGN_COLOR_TOKENS;

const GRAIN =
	"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E";

let fontFace = "";

function chewyFontFace(): string {
	if (fontFace === "") {
		const bytes = readFileSync(
			new URL("../assets/Chewy-Regular.ttf", import.meta.url),
		);
		fontFace = `@font-face{font-family:Chewy;font-style:normal;font-weight:400;font-display:swap;src:url("data:font/ttf;base64,${bytes.toString("base64")}") format("truetype")}`;
	}
	return fontFace;
}

/** Shared DESIGN.md chrome for Evidence report + desk documents. */
export function evidenceDocumentCss(): string {
	return `${chewyFontFace()}
:root{color-scheme:light;--ink:${ink};--paper:${paper};--cream:${cream};--mute:${mute};--faint:${faint};--spark:${spark};--go:${go};--soot:${soot};--border:${border};--border-strong:${borderStrong};--inset:${inset};--code-bg:${codeBg};--ease:cubic-bezier(.22,1,.36,1);--ease-boing:cubic-bezier(.34,1.56,.64,1);--dur-tap:120ms;--dur-move:220ms}
*{box-sizing:border-box}[hidden]{display:none!important}
html,body{margin:0;background:var(--cream);color:var(--ink);font:1rem/1.65 system-ui,-apple-system,"Segoe UI",sans-serif;min-height:100%}
body{padding:1.5rem;max-width:76rem;margin:0 auto}
h1,h2,h3,button,.action{font-family:Chewy,"Arial Rounded MT Bold",system-ui,sans-serif;font-weight:400}
h1{margin:0 0 .35rem;font-size:2.25rem;line-height:1.1;letter-spacing:.01em;transform:rotate(-1deg);text-shadow:3px 3px 0 var(--border)}
h2{margin:0 0 .65rem;font-size:1.5rem;line-height:1.2}
h3{margin:0 0 .4rem;font-size:1.25rem;line-height:1.2}
p{margin:.35rem 0 .85rem}
a{color:var(--ink);text-underline-offset:3px}a:hover{color:var(--spark)}
code{font:0.875rem/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;background:var(--code-bg);padding:.1rem .35rem;border:2px solid var(--border-strong);border-radius:4px}
.eyebrow,.meta{color:var(--mute);letter-spacing:.06em;text-transform:uppercase;font-size:.75rem;font-weight:700}
header,section{background:var(--paper);border:3px solid var(--ink);border-radius:18px;box-shadow:4px 4px 0 var(--ink);padding:1.25rem 1.4rem;margin:0 0 1.25rem}
.actions{display:flex;flex-wrap:wrap;gap:.75rem;margin:1rem 0 0}
button,.action{display:inline-grid;place-items:center;min-height:2.75rem;padding:.7rem 1.15rem;border:3px solid var(--ink);border-radius:4px;background:var(--inset);color:var(--ink);box-shadow:4px 4px 0 var(--ink);font-size:1.1rem;line-height:1;letter-spacing:.03em;text-align:center;text-decoration:none;cursor:pointer;transform:rotate(-.5deg)}
button:nth-child(even),.action:nth-child(even){transform:rotate(.5deg)}
button:hover,.action:hover{background:var(--spark);color:var(--paper)}
button:active,.action:active{transform:translate(3px,3px);box-shadow:1px 1px 0 var(--ink)}
button:focus-visible,.action:focus-visible,input:focus-visible,textarea:focus-visible,a:focus-visible{outline:3px solid var(--spark);outline-offset:3px}
button[disabled],.action[aria-disabled="true"]{opacity:.5;cursor:not-allowed;transform:none}
button[disabled]:hover,.action[aria-disabled="true"]:hover{background:var(--paper);color:var(--ink)}
.trust{display:grid;grid-template-columns:repeat(auto-fit,minmax(13rem,1fr));gap:.75rem;margin:1rem 0 0}
.trust div{border:3px solid var(--ink);border-radius:12px;box-shadow:4px 4px 0 var(--ink);padding:.75rem .85rem;background:var(--inset)}
.trust dt{font-weight:800;letter-spacing:.06em;text-transform:uppercase;font-size:.75rem}
.trust dd{margin:.2rem 0 0;color:var(--mute)}
.trust [data-state="verified"]{box-shadow:4px 4px 0 var(--go)}
.trust [data-state="stale"],.trust [data-state="missing"]{box-shadow:4px 4px 0 var(--spark)}
article,aside{border-top:3px solid var(--ink);padding-top:.85rem;margin-top:.85rem}
section>h2+article,section>h2+p,section>h2+aside{border-top:0;padding-top:0;margin-top:0}
[data-state]{border-left:6px dashed var(--faint);padding-left:.85rem}
[data-state="captured"]{border-left-style:solid;border-left-color:var(--ink)}
[data-state="verified"]{border-left-style:solid;border-left-color:var(--go)}
[data-state="stale"]{border-left-style:dotted;border-left-color:var(--spark)}
[data-state="missing"]{border-left-style:double;border-left-color:var(--spark)}
.state{text-transform:uppercase;letter-spacing:.08em;font-size:.75rem;font-weight:800;color:var(--mute)}
[data-state="verified"] .state{color:var(--go)}
[data-state="stale"] .state,[data-state="missing"] .state{color:var(--spark)}
form{background:var(--paper);border:3px solid var(--ink);border-radius:18px;box-shadow:4px 4px 0 var(--ink);padding:1.15rem 1.25rem;margin:1rem 0}
label{display:block;margin:.65rem 0 .25rem;font-size:.75rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
input,textarea{width:100%;border:3px solid var(--ink);border-radius:4px;padding:.65rem;background:var(--cream);color:var(--ink);font:inherit;box-shadow:3px 3px 0 var(--ink)}
textarea{min-height:5.5rem;resize:vertical}
form button{width:100%;margin-top:.75rem;background:var(--ink);color:var(--paper)}
.status{min-height:1.5rem;margin-top:1rem;color:var(--go);font-weight:700}
.desk{max-width:none;padding:1rem}
.desk header{display:flex;align-items:start;justify-content:space-between;gap:1rem;border-radius:12px;padding:1rem 1.1rem}
.desk .close{flex:0 0 auto}
.desk .action-group{margin:1rem 0}
.desk .action-group>h2{font-family:system-ui,sans-serif;font-size:.75rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
.desk .actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.85rem;padding:.1rem .15rem .4rem 0}
.journal .stream{list-style:none;margin:0;padding:0 0 3rem;display:flex;flex-direction:column;gap:1rem}
.journal .event{background:var(--paper);border:3px solid var(--ink);border-radius:18px;box-shadow:4px 4px 0 var(--ink);padding:1.1rem 1.25rem}
.journal .event[data-kind="ask"]{transform:rotate(-.3deg)}
.journal .event[data-kind="decision"]{transform:rotate(.3deg)}
.journal .event[data-kind="look"]{box-shadow:4px 4px 0 var(--spark)}
.journal .event[data-kind="impact"]{box-shadow:4px 4px 0 var(--go)}
.journal .reason{white-space:pre-wrap;margin:.35rem 0 .6rem}
.journal .look{margin:.75rem 0 0}
.journal .look img,.journal .look video{display:block;max-width:100%;border:3px solid var(--ink);border-radius:12px;box-shadow:4px 4px 0 var(--ink);background:var(--inset)}
.journal .empty{color:var(--mute);border:3px dashed var(--ink);border-radius:18px;padding:1.2rem;background:var(--paper)}
.journal[data-live] header h1::after{content:" live";color:var(--spark);font-size:1rem;letter-spacing:.08em}
body::after{content:"";position:fixed;inset:0;z-index:2147483646;pointer-events:none;opacity:.06;mix-blend-mode:multiply;background-image:url("${GRAIN}");background-size:240px 240px}
*{scrollbar-color:var(--ink) var(--inset);scrollbar-width:thick}
@media (max-width: 32rem){body{padding:.75rem}h1{font-size:1.6rem}}
@media (max-width: 20rem){.desk .actions{grid-template-columns:1fr}}
@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-delay:0s!important;transition-duration:.01ms!important;transition-delay:0s!important;scroll-behavior:auto!important}h1,button,.action{transform:none}button:active,.action:active{transform:none}body::after{opacity:0}}
`;
}

/** Overlay launcher + panel — same tokens, no SaaS elevation. */
// public-contract: Evidence overlay CSS is served to the debug iframe.
export const EVIDENCE_OVERLAY_CSS = `
:root{color-scheme:light}
.launcher{display:block;width:5.2rem;height:5.75rem;padding:0;border:0;background:transparent;color:${ink};cursor:pointer;filter:drop-shadow(2px 2px 0 ${ink}) drop-shadow(-2px -2px 0 ${cream});transition:transform 140ms cubic-bezier(.34,1.56,.64,1)}
.launcher[hidden]{display:none}
.launcher:hover{transform:translateY(-.12rem)}
.launcher:active{transform:translateY(.08rem)}
.launcher:focus-visible{outline:3px solid ${spark};outline-offset:4px;border-radius:12px}
.launcher[aria-expanded="true"]{display:none}
.bo{display:block;width:5.175rem;height:5.75rem;background:url("/__hobo/evidence/bo-idle.png") 0 0/62.1rem 5.75rem no-repeat;animation:hobo-bo-idle 7s steps(1,end) infinite}
.recording-stop{min-height:2.75rem;padding:.7rem 1rem;border:3px solid ${ink};border-radius:4px;background:${paper};color:${ink};box-shadow:4px 4px 0 ${ink};font:400 1rem/1 Chewy,"Arial Rounded MT Bold",system-ui,sans-serif;cursor:pointer}
.recording-stop:hover{background:${spark};color:${paper}}
.recording-stop:focus-visible{outline:3px solid ${spark};outline-offset:4px}
.recording-stop[hidden]{display:none}
.panel,.controls-shell{position:absolute;right:0;bottom:0;width:min(26rem,calc(100vw - 2rem));height:min(42rem,calc(100vh - 2rem));overflow:hidden;border:3px solid ${ink};border-radius:18px 18px 4px 18px;background:${paper};box-shadow:4px 4px 0 ${ink};transform-origin:bottom right;animation:hobo-evidence-in 160ms cubic-bezier(.22,1,.36,1)}
.panel[hidden],.controls-shell[hidden]{display:none}
iframe{display:block;width:100%;height:100%;border:0;background:${paper}}
@keyframes hobo-bo-idle{0%,55%,80%,87%,94%,100%{background-position-x:0}58%{background-position-x:-5.175rem}60%{background-position-x:-10.35rem}62%{background-position-x:-15.525rem}64%{background-position-x:-20.7rem}66%{background-position-x:-25.875rem}68%{background-position-x:-31.05rem}70%{background-position-x:-36.225rem}72%{background-position-x:-41.4rem}74%{background-position-x:-46.575rem}76%{background-position-x:-51.75rem}90%{background-position-x:-56.925rem}}
@keyframes hobo-evidence-in{from{opacity:.75;transform:translateY(.5rem) scale(.98)}to{opacity:1;transform:none}}
@media (max-width: 42rem){.panel,.controls-shell{position:fixed;inset:auto .5rem .5rem;height:min(72vh,42rem);width:auto;border-radius:18px 18px 4px 4px}}
@media (prefers-reduced-motion: reduce){.panel,.controls-shell{animation:none}.launcher{transition:none}.bo{animation:none}}
`;
