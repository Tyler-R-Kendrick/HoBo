export const REVIEW_BROWSER_KEYS = {
	next: ["j", "ArrowDown"],
	prev: ["k", "ArrowUp"],
	open: ["Enter"],
	back: ["Escape"],
	threads: ["t"],
} as const;

export function reviewBrowserControllerScript(): string {
	return `const headers={authorization:'Bearer '+cfg.token,'content-type':'application/json'};
const state={reviews:[],reviewId:null,revision:null,files:[],fileIndex:0,chunks:null,threads:[],status:'Loading review…'};
const api=async(path,options={})=>{const response=await fetch(path,{...options,headers,cache:'no-store'});const body=await response.json();if(!response.ok){const error=Error(body.error||response.statusText);error.body=body;error.status=response.status;throw error}return body};
async function loadList(){const query=cfg.sessionId?'?sessionId='+encodeURIComponent(cfg.sessionId):'';const body=await api('/api/reviews'+query);state.reviews=body.reviews||[];if(!state.reviewId&&state.reviews[0])state.reviewId=state.reviews[0].reviewId;renderReviewBrowser(state);if(state.reviewId)await loadReview(state.reviewId)}
async function loadReview(reviewId){state.reviewId=reviewId;const snapshot=await api('/api/reviews/'+encodeURIComponent(reviewId));state.revision=snapshot.revision;const files=await api('/api/reviews/'+encodeURIComponent(reviewId)+'/files');state.files=files.files||[];if(state.fileIndex>=state.files.length)state.fileIndex=0;const threads=await api('/api/reviews/'+encodeURIComponent(reviewId)+'/threads');state.threads=threads.threads||[];state.status='Review '+reviewId+' · r'+snapshot.revision;state.chunks=null;renderReviewBrowser(state);if(state.files[state.fileIndex])await loadChunks()}
async function loadChunks(){const file=state.files[state.fileIndex];if(!file||!state.reviewId)return;state.chunks=await api('/api/reviews/'+encodeURIComponent(state.reviewId)+'/files/'+encodeURIComponent(file.fileId)+'/chunks');renderReviewBrowser(state)}
function selectFile(index){if(!state.files.length)return;state.fileIndex=Math.max(0,Math.min(state.files.length-1,index));renderReviewBrowser(state)}
async function openFile(){await loadChunks();const files=document.querySelector('#files');files?.focus()}
function focusThreads(){document.querySelector('#threads')?.focus()}
function backToList(){state.chunks=null;state.status='Reviews';renderReviewBrowser(state);document.querySelector('#reviews')?.focus()}
document.addEventListener('click',(event)=>{const review=event.target.closest('[data-review-id]');if(review){event.preventDefault();loadReview(review.getAttribute('data-review-id'));return}const file=event.target.closest('[data-review-file]');if(!file)return;event.preventDefault();const index=state.files.findIndex((item)=>item.fileId===file.getAttribute('data-review-file'));if(index>=0){selectFile(index);openFile()}});
document.addEventListener('keydown',(event)=>{const inFiles=document.activeElement&&(document.activeElement.id==='files'||document.activeElement.closest('#files'));const inDiff=document.activeElement&&document.activeElement.id==='diff';if((event.key==='j'||event.key==='ArrowDown')&&(inFiles||inDiff||document.activeElement===document.body)){event.preventDefault();selectFile(state.fileIndex+1);return}if((event.key==='k'||event.key==='ArrowUp')&&(inFiles||inDiff||document.activeElement===document.body)){event.preventDefault();selectFile(state.fileIndex-1);return}if(event.key==='Enter'&&inFiles){event.preventDefault();openFile();return}if(event.key==='Escape'){event.preventDefault();backToList();return}if(event.key==='t'){event.preventDefault();focusThreads()}});
loadList().catch((error)=>{state.status=String(error);renderReviewBrowser(state)});`;
}
