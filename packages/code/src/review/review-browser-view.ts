export function reviewFileLabel(path: string): string {
	return `File ${path}`;
}

export function reviewBrowserStyles(): string {
	return `:root{color-scheme:dark;--ink:#d9e0e7;--muted:#82909e;--bg:#081015;--panel:#0d171d;--raised:#132128;--line:#29404b;--focus:#8bd5ca;--accent:#f5a97f;--bad:#ed8796}
*{box-sizing:border-box}body{font:14px ui-monospace,SFMono-Regular,Consolas,monospace;margin:1.5rem auto;padding:0 1rem;max-width:88rem;background:var(--bg);color:var(--ink)}
button{font:inherit;margin:.2rem;padding:.4rem .55rem;background:var(--raised);color:var(--ink);border:1px solid var(--line)}
button:hover{border-color:var(--accent)}button:focus-visible,[tabindex]:focus-visible{outline:2px solid var(--focus);outline-offset:1px}
header,nav,section{border:1px solid var(--line);background:var(--panel);padding:.75rem;margin:.75rem 0}
#files,#threads{min-height:8rem}#diff{min-height:12rem;white-space:pre-wrap}
.file-row[aria-selected=true],.review-row[aria-selected=true]{background:#18313a;color:#fff}
.muted{color:var(--muted)}#status{color:var(--muted)}`;
}

export function reviewBrowserMarkup(): string {
	return `<header>
<h1>HoBo Code review</h1>
<p>Authenticated loopback review · bearer-protected · no-store · product-owned surface.</p>
</header>
<nav id="reviews" aria-label="Reviews"></nav>
<main>
<section id="files" aria-label="Changed files" tabindex="0"></section>
<section id="diff" aria-label="Diff" tabindex="0"></section>
<section id="threads" aria-label="Review threads" tabindex="0"></section>
</main>
<p id="status" role="status" aria-live="polite"></p>`;
}

export function reviewBrowserViewScript(): string {
	return `function setText(node,value){node.textContent=value==null?'':String(value)}
function el(tag,attrs,text){const node=document.createElement(tag);if(attrs){for(const [key,value] of Object.entries(attrs)){if(value==null)continue;if(key==='className')node.className=String(value);else node.setAttribute(key,String(value))}}if(text!==undefined)setText(node,text);return node}
function fileLabel(path){return 'File '+path}
function filePath(file){return file.pathAfter||file.pathBefore||file.fileId}
function renderReviews(state){const root=document.querySelector('#reviews');root.replaceChildren();const heading=el('h2',null,'Reviews');root.append(heading);if(!state.reviews.length){root.append(el('p',{class:'muted'},'No reviews'));return}for(const review of state.reviews){const selected=review.reviewId===state.reviewId;const button=el('button',{'class':'review-row','data-review-id':review.reviewId,'aria-selected':String(selected),'aria-label':'Review '+review.reviewId},review.reviewId+' · r'+review.revision);button.type='button';root.append(button)}}
function renderFiles(state){const root=document.querySelector('#files');root.replaceChildren();root.append(el('h2',null,'Changed files'));if(!state.files.length){root.append(el('p',{class:'muted'},'No files'));return}state.files.forEach((file,index)=>{const path=filePath(file);const selected=index===state.fileIndex;const button=el('button',{'class':'file-row','data-review-file':file.fileId,'aria-selected':String(selected),'aria-label':fileLabel(path)},path);button.type='button';root.append(button)})}
function renderDiff(state){const root=document.querySelector('#diff');root.replaceChildren();root.append(el('h2',null,'Diff'));const file=state.files[state.fileIndex];if(!file){root.append(el('p',{class:'muted'},'Select a file'));return}root.append(el('p',null,filePath(file)));if(!state.chunks||!state.chunks.hunks||!state.chunks.hunks.length){root.append(el('p',{class:'muted'},'No inline hunks'));return}for(const hunk of state.chunks.hunks){root.append(el('pre',null,hunk.header||''));for(const line of hunk.lines||[])root.append(el('div',null,line.displayText||''))}}
function renderThreads(state){const root=document.querySelector('#threads');root.replaceChildren();root.append(el('h2',null,'Review threads'));if(!state.threads.length){root.append(el('p',{class:'muted'},'No threads'));return}for(const thread of state.threads){const box=el('article',{'data-thread-id':thread.threadId});box.append(el('h3',null,thread.threadId));for(const message of thread.messages||[])box.append(el('p',null,message.body||''));root.append(box)}}
function renderStatus(state){setText(document.querySelector('#status'),state.status||'')}
function renderReviewBrowser(state){renderReviews(state);renderFiles(state);renderDiff(state);renderThreads(state);renderStatus(state)}`;
}
