// Optional reading conveniences. The complete tutorial also works without JavaScript.
for(const button of document.querySelectorAll('[data-copy-code]')){
  button.hidden=false;
  button.addEventListener('click',async()=>{
    const code=button.closest('.code-block').querySelector('code');
    try{await navigator.clipboard.writeText(code.textContent);button.textContent='已复制';}
    catch{const range=document.createRange();range.selectNodeContents(code);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);button.textContent='已选中，请手动复制';}
    button.setAttribute('aria-live','polite');clearTimeout(button.resetTimer);button.resetTimer=setTimeout(()=>button.textContent='复制代码',2500);
  });
}
const links=[...document.querySelectorAll('.guide-nav a')];
const sections=links.map(a=>document.getElementById(a.hash.slice(1))).filter(Boolean);
function updateReading(){
  const current=sections.filter(s=>s.getBoundingClientRect().top<innerHeight*.4).at(-1)||sections[0];
  for(const link of links){if(link.hash===`#${current?.id}`)link.setAttribute('aria-current','step');else link.removeAttribute('aria-current');}
}
if(sections.length){let scheduled=false;addEventListener('scroll',()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{updateReading();scheduled=false});},{passive:true});addEventListener('resize',updateReading);updateReading();}
