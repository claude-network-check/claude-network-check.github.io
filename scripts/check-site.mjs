// Release checks for generated HTML, independent of browser JavaScript or external APIs.
import {readFile,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pageMetadata,siteBase} from './seo.mjs';
const root=fileURLToPath(new URL('../dist/',import.meta.url)),base=siteBase(process.env.SITE_URL);
const titles=new Set(),descriptions=new Set();
const pages=new Map(await Promise.all(Object.keys(pageMetadata).map(async name=>[name,await readFile(path.join(root,name),'utf8')])));
const sitemap=await readFile(path.join(root,'sitemap.xml'),'utf8');
for(const [file,html] of pages){
  const meta=pageMetadata[file];
  assert.equal((html.match(/<h1(?:\s|>)/g)||[]).length,1,`${file}: one descriptive H1`);
  assert.equal((html.match(/rel="canonical"/g)||[]).length,1,`${file}: one canonical`);
  assert.ok(html.includes(`rel="canonical" href="${new URL(meta.path,base).href}"`),`${file}: canonical URL`);
  const title=html.match(/<title>(.*?)<\/title>/s)?.[1],description=html.match(/name="description" content="([^"]+)"/)?.[1];
  assert.ok(title&&!titles.has(title),`${file}: unique title`);titles.add(title);
  assert.ok(description&&!descriptions.has(description),`${file}: unique description`);descriptions.add(description);
  assert.equal(sitemap.includes(`<loc>${new URL(meta.path,base).href}</loc>`),!meta.noindex,`${file}: sitemap indexability`);
  const structured=JSON.parse(html.match(/application\/ld\+json">(.*?)<\/script>/s)[1]);assert.ok(structured['@graph'].some(n=>n['@type']==='WebPage'));
  for(const [,raw] of html.matchAll(/(?:href|src)="([^"]+)"/g)){
    const url=new URL(raw,new URL(file,base));if(url.origin!==new URL(base).origin)continue;
    assert.ok(url.pathname.startsWith(new URL(base).pathname),`${file}: outside deployment path`);
    const target=decodeURIComponent(url.pathname.slice(new URL(base).pathname.length))||'index.html';
    await access(path.join(root,target));
    if(url.hash&&pages.has(target))assert.ok(pages.get(target).includes(`id="${decodeURIComponent(url.hash.slice(1))}"`),`${file}: broken fragment ${raw}`);
  }
}
assert.equal((pages.get('index.html').match(/<details><summary>/g)||[]).length,4,'Static FAQ is readable without JavaScript');
assert.ok((await readFile(path.join(root,'404.html'),'utf8')).includes('noindex,follow'));
assert.ok((await readFile(path.join(root,'robots.txt'),'utf8')).includes(`Sitemap: ${base}sitemap.xml`));
console.log('SEO artifact checks passed: titles, headings, canonical, schema, sitemap, links, FAQ and 404.');
