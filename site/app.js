import {environmentScore,safeReport} from './core.js';
import {collectLocal} from './local.js';
import {runNetwork,unknownResult} from './network.js';
import {checks,networkIDs} from './catalog.js';
import {reportSummary,endpointView,rowValue,recommendations,evidenceGroup,matchesFilter} from './presentation.js';
const $=id=>document.getElementById(id);
const labels={idle:'待检测',pending:'检测中',observed:'已读取',unknown:'未确认',limited:'检测受限',review:'需核对'};
let results={},controller=null,lastRun=0,filter='all',localOnly=false,stopped=false;
function el(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
function icon(kind){
  const paths={network:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M3 12h18M12 3c4 5 4 13 0 18-4-5-4-13 0-18',region:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l3 2',device:'M4 4h16v12H4zM8 20h8M12 16v4',chevron:'m9 5 7 7-7 7'};
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[kind]);svg.append(path);return svg;
}
function rowsElement(rows){const dl=el('dl');for(const [label,value] of rows){const row=el('div','row');row.append(el('dt','',label),el('dd','',value??'未提供'));dl.append(row);}return dl;}
for(const check of checks){
  const card=el('details','check-card');card.id=check.id;card.dataset.state='idle';card.dataset.group=check.group;
  const summary=el('summary','check-summary');summary.setAttribute('aria-label',`${check.name}，展开检测依据`);
  const symbol=el('span','check-icon');symbol.append(icon(evidenceGroup(check)));
  const name=el('span','check-name');name.append(el('span','check-title',check.name),el('span','check-hint',check.hint));
  const value=el('span','result-value','等待检测');const badge=el('span','badge','待检测');badge.dataset.state='idle';
  const arrow=el('span','expand-icon');arrow.append(icon('chevron'));summary.append(symbol,name,value,badge,arrow);
  const body=el('div','detail-body');body.append(el('p','summary',check.hint),el('dl'),el('p','source',`数据来源：${check.source}`));card.append(summary,body);$(`${evidenceGroup(check)}-list`).append(card);
}
function applyFilter(){
  const query=$('search').value;let count=0;
  for(const check of checks){const visible=matchesFilter(check,results[check.id],filter,query);$(check.id).hidden=!visible;if(visible)count++;}
  for(const section of document.querySelectorAll('.result-group'))section.hidden=![...section.querySelectorAll('.check-card')].some(c=>!c.hidden);
  if(filter!=='all'||query.trim())$('supplementary').open=true;
  $('empty-results').hidden=count!==0;
}
function setFilter(value){filter=value;for(const b of document.querySelectorAll('[data-filter]'))b.setAttribute('aria-pressed',String(b.dataset.filter===value));applyFilter();}
function reveal(id){$('evidence').open=true;$('search').value='';setFilter('all');const card=$(id);if(evidenceGroup(checks.find(c=>c.id===id))==='device')$('supplementary').open=true;card.open=true;card.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});card.querySelector('summary').focus({preventScroll:true});}
const highlights={privacy:[['rtc','WebRTC','浏览器是否暴露其他地址'],['ipv6','IPv6','是否存在另一条网络出口'],['dns','DNS 解析器','解析请求由哪里处理'],['ecs','ECS 子网','DNS 是否附带子网信息']],region:[['timezone','时区','当前浏览器声明的时区'],['languages','首选语言','浏览器的第一语言'],['locale','区域格式','日期与数字的格式偏好'],['offset','UTC 偏移','当前时差'] ]};
for(const [group,items] of Object.entries(highlights))for(const [id,title,hint] of items){
  const button=el('button','signal-row');button.type='button';button.dataset.signal=id;button.addEventListener('click',()=>reveal(id));
  const name=el('span','signal-name');name.append(el('strong','',title),el('small','',hint));
  const data=el('span','signal-data');data.append(el('span','signal-value','等待检测'),el('span','signal-state','待检测'));
  button.append(name,data,el('span','signal-arrow','›'));$(`${group}-signals`).append(button);
}
function updateSummary(){
  const summary=reportSummary(results,checks,{running:Boolean(controller),localOnly,stopped});
  const {count,review,unknown,limited}=summary;
  $('completed-count').textContent=`${count} / ${checks.length} 项`;
  $('view-issues').textContent=review.length?'查看所有待核对项 →':'查看未确认项目 →';
  $('filter-limited-count').textContent=limited.length;
  $('coverage-note').hidden=!limited.length;$('coverage-note').textContent=limited.map(c=>`${c.name}：${results[c.id].value}`).join('；')+'。这些项目没有被判定为安全，点击分项查看范围。';
  $('filter-review-count').textContent=review.length;$('filter-unknown-count').textContent=unknown.length;
  $('progress-fill').style.width=`${count/checks.length*100}%`;document.body.dataset.running=Boolean(controller);
  $('verdict').dataset.state=summary.state;$('verdict-title').textContent=summary.title;$('verdict-description').textContent=summary.description;
  $('verdict-label').textContent=controller?'正在检测当前浏览器':count?localOnly?'本地检测结果':'本轮检测结论':'开始之前，先检查访问环境';
  if(controller)$('progress').textContent='检测中';
  for(const box of document.querySelectorAll('[data-endpoint]')){
    const view=endpointView(results[box.dataset.endpoint]);box.dataset.state=view.state;box.querySelector('.ip-address').textContent=view.ip;box.querySelector('.endpoint-location').textContent=view.location;box.querySelector('.endpoint-provider').textContent=view.provider;
    const badge=box.querySelector('.badge');badge.dataset.state=view.state;badge.textContent=view.state==='observed'?'已取得出口':labels[view.state];
  }
  $('baseline-ip').textContent=results.ipv4?.value||'等待检测';
  const exit=results.egress;$('exit-consistency').textContent=exit?`${exit.value} ↗`:'等待出口对照 ↗';$('exit-consistency').dataset.state=exit?.state||'idle';
  $('stability-value').textContent=results.stability?.state==='observed'||results.stability?.state==='review'?results.stability.value:'响应耗时 —';
  for(const row of document.querySelectorAll('[data-signal]')){const data=results[row.dataset.signal];row.dataset.state=data?.state||'idle';row.querySelector('.signal-value').textContent=data?.value||'等待检测';const detail=row.dataset.signal==='dns'?rowValue(data,'归属 1'):row.dataset.signal==='rtc'?rowValue(data,'公网候选归属 1'):row.dataset.signal==='languages'?rowValue(data,'中文偏好'):null;row.querySelector('.signal-state').textContent=[labels[data?.state||'idle'],detail].filter(Boolean).join(' · ');}
  const items=recommendations(results,checks);$('priorities').hidden=controller||!items.length;$('recommendations').replaceChildren();
  for(const [i,item] of items.entries()){
    const card=el('article','recommendation');card.dataset.state=item.state;
    const content=el('div','recommendation-copy');content.append(el('h3','',item.title),el('p','',item.description));
    const links=el('div','recommendation-links'),evidence=el('button','plain-link','查看依据 ↗'),guide=el('a','','修复方法 ↗');evidence.addEventListener('click',()=>reveal(item.id));guide.href=item.href;links.append(evidence,guide);
    card.append(el('span','recommendation-number',String(i+1).padStart(2,'0')),content,links);$('recommendations').append(card);
  }
  applyFilter();
}
function render(id,data){results[id]=data;const card=$(id);card.dataset.state=data.state;const badge=card.querySelector('.badge');badge.dataset.state=data.state;badge.textContent=labels[data.state];card.querySelector('.result-value').textContent=data.value||'未提供';card.querySelector('.summary').textContent=data.summary||'';card.querySelector('dl').replaceWith(rowsElement(data.rows||[]));updateSummary();}
function renderScore(env){
  const assessment=environmentScore(env),value=assessment.score;
  $('score').textContent=value??'—';$('score-level').textContent=value===null?'信息不足':value<=30?'特征较少':value<=60?'部分特征':'特征较明显';
  $('score-reasons').replaceChildren(...assessment.signals.map(s=>{const item=el('span','',`${s.label} ${s.value===undefined||s.value===''?'未知':`+${s.hit?s.weight:0}`}`);item.dataset.hit=s.hit;return item;}));
  results.assessment={state:value===null?'unknown':'observed',summary:`区域信号指数 ${value??'未知'}/100；仅四项本地信号，不代表网络安全或 Claude 识别概率。`,rows:assessment.signals.map(s=>[s.label,s.value??'未提供'])};
}
function showReport(){document.body.dataset.phase='report';$('scan-state').hidden=false;$('consent').hidden=true;$('export').hidden=false;}
function localScan(){const {env,checks:localResults}=collectLocal();showReport();renderScore(env);for(const [id,result] of Object.entries(localResults))render(id,result);$('export').disabled=false;}
function orderEvidence(){const rank={review:0,unknown:1,limited:2,observed:3,idle:4,pending:5};for(const name of ['network','region','device']){const items=checks.filter(c=>evidenceGroup(c)===name).sort((a,b)=>(rank[results[a.id]?.state]??3)-(rank[results[b.id]?.state]??3));for(const c of items)$(`${name}-list`).append($(c.id));}}
async function run(){
  if(controller)return;if(Date.now()-lastRun<15000){showReport();$('progress').textContent='请间隔 15 秒再检测';return;}
  lastRun=Date.now();controller=new AbortController();const signal=controller.signal;localOnly=false;stopped=false;showReport();
  $('start').disabled=true;$('local').disabled=true;$('cancel').hidden=false;$('export').disabled=true;
  results={};$('search').value='';setFilter('all');
  for(const check of checks){$(check.id).open=false;render(check.id,{state:'pending',value:'正在读取…',summary:'正在读取',rows:[]});}
  try{localScan();$('export').disabled=true;await runNetwork({signal,onResult:render});}
  catch(error){for(const check of checks)if(results[check.id]?.state==='pending')render(check.id,unknownResult(error));}
  finally{stopped=signal.aborted;controller=null;updateSummary();orderEvidence();$('start').disabled=false;$('local').disabled=false;$('cancel').hidden=true;$('export').disabled=false;$('start').textContent='重新检测 ↗';$('progress').textContent=stopped?'已停止，保留已完成观测':'本轮检测完成';}
}
for(const b of document.querySelectorAll('[data-filter]'))b.addEventListener('click',()=>setFilter(b.dataset.filter));$('search').addEventListener('input',applyFilter);
for(const button of document.querySelectorAll('[data-reveal]'))button.addEventListener('click',()=>reveal(button.dataset.reveal));
$('view-issues').addEventListener('click',()=>{$('evidence').open=true;$('search').value='';setFilter(checks.some(c=>results[c.id]?.state==='review')?'review':'unknown');$('evidence').scrollIntoView({behavior:'smooth',block:'start'});});
$('start').addEventListener('click',run);
$('local').addEventListener('click',()=>{localOnly=true;stopped=false;results={};for(const c of checks){$(c.id).open=false;render(c.id,{state:'idle',value:'尚未检测',summary:c.hint,rows:[]});}localScan();orderEvidence();$('progress').textContent='本地检查完成';});
$('cancel').addEventListener('click',()=>controller?.abort(new DOMException('已取消','AbortError')));
$('export').addEventListener('click',()=>{const report=safeReport(results);report.scope=localOnly?'仅当前浏览器本地检查；未验证网络。':'当前页面观测';const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='network-check-redacted.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
