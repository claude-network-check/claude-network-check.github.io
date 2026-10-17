import {test} from 'node:test';
import assert from 'node:assert/strict';
import {siteBase,seoHead,sitemap,pageMetadata,documentNavigation,notFoundPage} from '../scripts/seo.mjs';
test('canonical and sitemap support origin and project subpath deployments',()=>{
  const base=siteBase('https://example.com/project');assert.equal(base,'https://example.com/project/');
  const head=seoHead(pageMetadata['index.html'],base);assert.ok(head.includes('href="https://example.com/project/"'));
  assert.ok(head.includes('https://example.com/project/social-preview.png'));
  const xml=sitemap(base);assert.ok(xml.includes('https://example.com/project/guide.html'));assert.ok(!xml.includes('validation.html'));
  assert.throws(()=>siteBase('http://example.com'));assert.throws(()=>siteBase('https://user:password@example.com'));
});
test('metadata safely escapes text and contains parseable truthful JSON-LD',()=>{
  const head=seoHead({...pageMetadata['index.html'],title:'A "quote" <tag>'},siteBase());
  assert.ok(head.includes('A &quot;quote&quot; &lt;tag&gt;'));
  const data=JSON.parse(head.match(/application\/ld\+json">(.*?)<\/script>/s)[1]);const app=data['@graph'].find(n=>n['@type']==='WebApplication');assert.equal(app.isAccessibleForFree,true);assert.equal(app.aggregateRating,undefined);assert.equal(app.codeRepository,undefined);assert.ok(data['@graph'].some(n=>n['@type']==='WebSite'));
});

test('document schema matches visible breadcrumb and excludes itself from related pages',()=>{
  const meta=pageMetadata['guide.html'],base=siteBase('https://example.com/project/');
  const data=JSON.parse(seoHead(meta,base).match(/application\/ld\+json">(.*?)<\/script>/s)[1]);
  const trail=data['@graph'].find(n=>n['@type']==='BreadcrumbList');
  assert.deepEqual(trail.itemListElement.map(i=>i.item),[base,base+'guide.html']);
  const {breadcrumb,related}=documentNavigation(meta);assert.ok(breadcrumb.includes(meta.label));assert.ok(!related.includes('href="./guide.html"'));assert.ok(related.includes('research.html'));
});
test('not-found page stays noindex and links to correct root from a nested bad URL',()=>{
  const html=notFoundPage(siteBase('https://example.com/project/'));assert.ok(html.includes('content="noindex,follow"'));assert.ok(html.includes('href="https://example.com/project/guide.html"'));assert.ok(!html.includes('rel="canonical"'));
});
