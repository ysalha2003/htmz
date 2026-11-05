// Optional progressive enhancement: only the demo uses this file.
// It reports iframe navigation activity but cannot determine HTTP status.
const statusNode=document.getElementById('busy');
const targetFrame=document.querySelector('iframe[name="htmz"]');
function indicate(active){
  if(statusNode) statusNode.textContent=active?'جارٍ تحميل الجزء المطلوب…':'';
  document.querySelector('.app')?.toggleAttribute('aria-busy',active);
}
document.addEventListener('click',event=>{
  if(event.target.closest('a[target="htmz"]'))indicate(true);
});
document.addEventListener('submit',event=>{
  if(event.target.getAttribute('target')==='htmz')indicate(true);
});
targetFrame?.addEventListener('load',()=>indicate(false));
