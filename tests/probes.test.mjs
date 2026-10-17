import {test} from 'node:test';
import assert from 'node:assert/strict';
import {request,publicIP,geoIP,trace,dns,webRTC} from '../site/probes.js';
const response=data=>async()=>new Response(JSON.stringify(data),{status:200});

test('429 is not retried; credentials and referrer are omitted',async()=>{
  let calls=0;await assert.rejects(request('https://rate-limit.invalid',{fetcher:async(url,opts)=>{calls++;assert.equal(opts.credentials,'omit');assert.equal(opts.referrerPolicy,'no-referrer');return new Response('',{status:429,headers:{'Retry-After':'60'}});}}),e=>e.status===429&&e.retryAfter==='60');assert.equal(calls,1);
  await assert.rejects(request('https://rate-limit.invalid',{fetcher:async()=>{calls++;return new Response('{}');}}),e=>e.status===429);assert.equal(calls,1);
});
test('timeout and external cancellation abort in-flight requests',async()=>{
  const fetcher=(url,{signal})=>new Promise((resolve,reject)=>{if(signal.aborted)reject(signal.reason);else signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});
  await assert.rejects(request('https://example.invalid',{fetcher,timeout:10}),e=>e.name==='TimeoutError');
  const c=new AbortController();const p=request('https://example.invalid',{fetcher,signal:c.signal});c.abort();await assert.rejects(p,e=>e.name==='AbortError');
});
test('API contracts: strict family, matched geo and recognized DNS schema',async()=>{
  assert.equal((await publicIP(4,null,response({ip:'192.0.2.1'}))).ip,'192.0.2.1');
  await assert.rejects(publicIP(6,null,response({ip:'192.0.2.1'})));
  await assert.rejects(geoIP('192.0.2.1',null,response({success:false})));
  await assert.rejects(geoIP('192.0.2.1',null,response({success:true,ip:'192.0.2.2'})));
  assert.equal((await geoIP('192.0.2.1',null,response({success:true,ip:'192.0.2.1',connection:{asn:64496}}))).asn,64496);
  assert.equal((await dns(null,response({dns:{ip:'192.0.2.2'}}))).resolver,'192.0.2.2');
  await assert.rejects(trace('unapproved.example',null,response({})));
});
test('WebRTC closes peer after empty timeout, cancellation and offer failure',async()=>{
  let closed=0;
  class Peer{createDataChannel(){}createOffer(){return Promise.resolve({});}setLocalDescription(){return Promise.resolve();}close(){closed++;}}
  assert.deepEqual(await webRTC(null,{Peer,timeout:10}),{candidates:[]});assert.equal(closed,1);
  const c=new AbortController();const p=webRTC(c.signal,{Peer});c.abort();await assert.rejects(p);assert.equal(closed,2);
  class BadPeer extends Peer{createOffer(){return Promise.reject(new Error('denied'));}}
  await assert.rejects(webRTC(null,{Peer:BadPeer}));assert.equal(closed,3);
});
test('WebRTC retains gathered candidates and closes on completion',async()=>{
  let closed=false;
  class Peer{createDataChannel(){}createOffer(){return Promise.resolve({});}async setLocalDescription(){this.onicecandidate({candidate:{address:'192.0.2.1',type:'srflx'}});this.onicecandidate({candidate:null});}close(){closed=true;}}
  const r=await webRTC(null,{Peer});assert.equal(r.candidates.length,1);assert.equal(closed,true);
});

test('country lookup survives metadata-provider failure without inventing ASN',async()=>{
  const calls=[];const fetcher=async url=>{const u=new URL(url);calls.push(u.hostname);if(u.hostname==='api.country.is')return new Response(JSON.stringify({ip:'192.0.2.9',country:'DE'}));throw new TypeError('Metadata unavailable');};
  const g=await geoIP('192.0.2.9',null,fetcher);assert.equal(g.countryCode,'DE');assert.equal(g.asn,undefined);assert.equal(g.partial,true);
  await geoIP('192.0.2.9',null,fetcher);assert.equal(calls.length,3);assert.equal(g.source,'country.is');
});
test('anonymous metadata schema and country ISO are merged only for a matching IP',async()=>{
  const fetcher=async url=>new URL(url).hostname==='api.country.is'?new Response(JSON.stringify({ip:'192.0.2.8',country:'DE'})):new Response(JSON.stringify({ip:'192.0.2.8',country:'Germany',city:'Example',company:'Example ISP',asn:'AS64496 Example',timezone:'Europe/Berlin'}));
  const g=await geoIP('192.0.2.8',null,fetcher);assert.equal(g.countryCode,'DE');assert.equal(g.asn,64496);assert.equal(g.isp,'Example ISP');
  const mismatch=async()=>new Response(JSON.stringify({ip:'192.0.2.99',country:'DE',success:true}));await assert.rejects(geoIP('192.0.2.8',null,mismatch));
});
test('IP echo switches provider after failure and never substitutes the wrong protocol',async()=>{
  const calls=[];const fetcher=async url=>{calls.push(new URL(url).hostname);if(calls.length===1)throw new TypeError('primary down');return new Response('192.0.2.7');};
  assert.equal((await publicIP(4,null,fetcher)).ip,'192.0.2.7');assert.deepEqual(calls,['api.ipify.org','4.ident.me']);
  await assert.rejects(publicIP(6,null,async()=>new Response('192.0.2.7')),e=>e.code==='IPV6_UNREACHABLE');
});
test('cancellation prevents starting fallback providers',async()=>{
  const c=new AbortController();let calls=0;const fetcher=async()=>{calls++;c.abort();throw c.signal.reason;};
  await assert.rejects(publicIP(4,c.signal,fetcher),e=>e.name==='AbortError');assert.equal(calls,1);
});

test('primitive abort reasons and frozen errors preserve meaningful failures',async()=>{
  const c=new AbortController();c.abort('cancelled');
  await assert.rejects(request('https://example.invalid',{signal:c.signal,fetcher:async()=>{throw c.signal.reason;}}),e=>e.name==='AbortError'&&e.provider==='example.invalid');
  await assert.rejects(request('https://example.invalid',{fetcher:async()=>{throw Object.freeze(new TypeError('offline'));}}),e=>e.name==='TypeError'&&e.message==='offline');
});
