import {test} from 'node:test';
import assert from 'node:assert/strict';
import {siteBase,seoHead,sitemap,pageMetadata} from '../scripts/seo.mjs';
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
  const data=JSON.parse(head.match(/application\/ld\+json">(.*?)<\/script>/s)[1]);assert.equal(data['@type'],'WebApplication');assert.equal(data.isAccessibleForFree,true);assert.equal(data.aggregateRating,undefined);
});
