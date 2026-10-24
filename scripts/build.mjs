import {mkdir,rm,cp,readFile,writeFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {makeZip} from './zip.mjs';
import {guidePage} from './guide.mjs';
import {pageMetadata,siteBase,seoHead,sitemap,documentNavigation,notFoundPage} from './seo.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
const base=siteBase(process.env.SITE_URL);
await rm(dist,{recursive:true,force:true});await mkdir(dist,{recursive:true});
for(const folder of ['site','docs','skills'])await cp(path.join(root,folder),folder==='site'?dist:path.join(dist,folder),{recursive:true});
await cp(path.join(root,'LICENSE'),path.join(dist,'LICENSE'));
await writeFile(path.join(dist,'.nojekyll'),'');
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function link(url){
  if(/^https:\/\//.test(url))return escape(url);
  if(/^[a-z]+:/i.test(url))throw new Error('Unsupported document URL');
  const normalized=new URL(`docs/${url}`,'https://example.invalid/').pathname.slice(1);
  const pages={'docs/guide.zh-CN.md':'guide.html','docs/research.zh-CN.md':'research.html','docs/validation.md':'validation.html','docs/coverage.zh-CN.md':'coverage.html'};
  return escape(pages[normalized] || normalized);
}
function inline(text){
  return escape(text).replace(/!\[([^\]]*)\]\(([^)]+)\)/g,(_,alt,url)=>`<img src="./${link(url)}" alt="${alt}" loading="lazy">`).replace(/\[([^\]]*)\]\(([^)]+)\)/g,(_,label,url)=>`<a href="${/^https:/.test(url)?'':'./'}${link(url)}">${label}</a>`).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
}
// Small renderer for these trusted, repository-owned documents; not a general Markdown parser.
function markdown(source){
  const lines=source.split('\n');let output='',i=0;
  while(i<lines.length){const line=lines[i];
    if(!line.trim()){i++;continue;}
    if(line.startsWith('```')){const language=line.slice(3).trim();let code=[];i++;while(i<lines.length&&!lines[i].startsWith('```'))code.push(lines[i++]);i++;output+=`<div class="code-block"><div class="code-toolbar"><span>${escape(language||'CODE')}</span><button type="button" data-copy-code hidden>复制代码</button></div><pre><code>${escape(code.join('\n'))}</code></pre></div>`;continue;}
    if(line.startsWith('> ')){const quotes=[];while(i<lines.length&&lines[i].startsWith('> '))quotes.push(lines[i++].slice(2));output+=`<blockquote class="checkpoint"><span aria-hidden="true">↳</span><p>${inline(quotes.join(' '))}</p></blockquote>`;continue;}
    if(/^#{1,3} /.test(line)){const n=line.indexOf(' '),heading=line.slice(n+1),anchor=n===2?({'1':'routing','2':'tun','3':'dns','4':'browser','5':'verify'}[heading[0]]):null;output+=`<h${n}${anchor?` id="${anchor}"`:''}>${inline(heading)}</h${n}>`;i++;continue;}
    if(line.startsWith('|')){const table=[];while(i<lines.length&&lines[i].startsWith('|'))table.push(lines[i++]);output+='<div class="table-scroll"><table>';table.forEach((row,index)=>{if(index===1)return;const tag=index===0?'th':'td';output+=`<tr>${row.split('|').slice(1,-1).map(c=>`<${tag}>${inline(c.trim())}</${tag}>`).join('')}</tr>`;});output+='</table></div>';continue;}
    if(/^(?:- |\d+\. )/.test(line)){const ordered=/^\d/.test(line),tag=ordered?'ol':'ul';output+=`<${tag}>`;while(i<lines.length&&/^(?:- |\d+\. )/.test(lines[i]))output+=`<li>${inline(lines[i++].replace(/^(?:- |\d+\. )/,''))}</li>`;output+=`</${tag}>`;continue;}
    const para=[line];i++;while(i<lines.length&&lines[i].trim()&&!/^(?:#|```|\||- |\d+\. )/.test(lines[i]))para.push(lines[i++]);output+=`<p>${inline(para.join(' '))}</p>`;
  }return output;
}
const header=active=>`<svg class="sprite" aria-hidden="true"><symbol id="i-pulse" viewBox="0 0 24 24"><path d="M3 12h4l3-8 4 16 3-8h4"/></symbol><symbol id="i-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></symbol><symbol id="i-moon" viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></symbol></svg><a class="skip" href="#main">跳到主要内容</a><header class="site-header"><div class="wrap header-inner"><a class="brand" href="./"><span class="brand-mark"><svg><use href="#i-pulse"/></svg></span><span>Claude Network Check</span></a><nav class="site-nav" aria-label="主导航"><a href="./">环境检测</a><a href="./guide.html"${active==='guide'?' aria-current="page"':''}>配置教程</a><a href="./research.html"${active==='research'?' aria-current="page"':''}>检测方法</a></nav><button class="icon-btn theme-toggle" type="button" aria-label="切换深浅色"><svg class="sun"><use href="#i-sun"/></svg><svg class="moon"><use href="#i-moon"/></svg></button></div></header>`;
const footer='<footer class="site-footer"><div class="wrap footer-inner"><span>Claude Network Check · 独立开源项目，与 Anthropic 无关</span><span class="footer-links"><a href="./">环境检测</a><a href="./guide.html">配置教程</a><a href="./research.html">检测方法</a><a href="./coverage.html">检测范围</a></span></div></footer>';
for(const [file,title,name] of [['guide.zh-CN.md','5 步配置教程','guide'],['research.zh-CN.md','免费 API 与纯前端调研','research'],['validation.md','测试记录','validation'],['coverage.zh-CN.md','IPPure 功能对照','coverage']]){
  const source=await readFile(path.join(root,'docs',file),'utf8');
  const content=name==='guide'?guidePage(source,markdown):`<main class="wrap document" id="main">${markdown(source)}</main>`;
  await writeFile(path.join(dist,`${name}.html`),`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta name="color-scheme" content="light dark"><title>${title} · Network Check</title><link rel="stylesheet" href="./base.css"><link rel="stylesheet" href="./guide.css"><script src="./theme.js"></script><script type="module" src="./docs.js"></script><link rel="icon" href="./favicon.svg"></head><body>${header(name)}${content}${footer}</body></html>`);
}
const files=[];
async function walk(dir,prefix){for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const name=`${prefix}/${entry.name}`;if(entry.isDirectory())await walk(path.join(dir,entry.name),name);else files.push({name,content:await readFile(path.join(dir,entry.name))});}}
await walk(path.join(root,'skills','claude-network-setup'),'claude-network-setup');
await mkdir(path.join(dist,'downloads'),{recursive:true});
await writeFile(path.join(dist,'downloads','claude-network-setup.zip'),makeZip(files));
for(const [file,meta] of Object.entries(pageMetadata)){
  const target=path.join(dist,file);let html=await readFile(target,'utf8');
  html=html.replace(/<title>[\s\S]*?<\/title>/,'').replace(/<meta name="description"[^>]*>/g,'').replace('</head>',`${seoHead(meta,base)}</head>`);
  if(meta.path){const {breadcrumb,related}=documentNavigation(meta);html=html.replace(/(<main[^>]*>)/,`$1${breadcrumb}`).replace('</main>',`${related}</main>`);}
  html=html.replace('<span class="footer-links">','<span class="footer-links"><a href="https://github.com/claude-network-check/claude-network-check.github.io">GitHub ↗</a>');
  await writeFile(target,html);
}
await writeFile(path.join(dist,'404.html'),notFoundPage(base));
await writeFile(path.join(dist,'robots.txt'),`User-agent: *\nAllow: /\nSitemap: ${base}sitemap.xml\n`);
await writeFile(path.join(dist,'sitemap.xml'),sitemap(base));
console.log('Built static site, SEO metadata, documents and Skill ZIP into dist/');
