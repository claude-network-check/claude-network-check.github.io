import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checks,networkIDs} from '../site/catalog.js';
import {baseLanguage,offsetLabel,offsetAtZone,consistency,pixelStats,platformStyle,fontNames} from '../site/local.js';
import {compareExits,responseStats,geoCache,runNetwork} from '../site/network.js';

test('coverage: six reference local signals, both Claude domains and privacy checks exist',()=>{
  assert.equal(new Set(checks.map(c=>c.id)).size,checks.length);
  for(const id of ['timezone','languages','fonts','locale','offset','emoji','claude-ai','claude-com','dns','rtc'])assert.ok(checks.some(c=>c.id===id));
  assert.equal(checks.length,22);assert.equal(networkIDs.length,10);assert.equal(fontNames.length,24);
});
test('time comparison handles fractional zones and seasonal offsets',()=>{
  assert.equal(offsetAtZone('Asia/Kathmandu',new Date('2026-01-15T12:00:00Z')),345);
  assert.equal(offsetAtZone('America/New_York',new Date('2026-01-15T12:00:00Z')),-300);
  assert.equal(offsetAtZone('America/New_York',new Date('2026-07-15T12:00:00Z')),-240);
  assert.equal(offsetLabel(-210),'UTC−03:30');assert.equal(offsetLabel(345),'UTC+05:45');
  assert.equal(consistency(null,480,'').state,'unknown');assert.equal(consistency(0,0,'').state,'observed');assert.equal(consistency(60,0,'').state,'review');
  assert.equal(baseLanguage('zh-Hant-TW'),'zh');
});
test('pixel analysis ignores transparent pixels and does not confuse mono with colored',()=>{
  assert.deepEqual(pixelStats(new Uint8Array([255,0,0,0])),{ink:0,color:0,ratio:null});
  assert.equal(pixelStats(new Uint8Array([20,20,20,255,255,0,0,255])).ratio,.5);
  assert.equal(platformStyle('Android on Linux'),'Android / Google 风格线索');
});
test('egress only compares equal IP families and reports incomplete evidence',()=>{
  assert.equal(compareExits([{name:'a',ip:'192.0.2.1'},{name:'b',ip:'2001:db8::1'}]).state,'unknown');
  assert.equal(compareExits([{name:'a',ip:'192.0.2.1'},{name:'b',ip:'192.0.2.1'}]).state,'observed');
  assert.equal(compareExits([{name:'a',ip:'192.0.2.1'},{name:'b',ip:'192.0.2.2'}]).state,'review');
  assert.equal(compareExits([{name:'a',ip:'192.0.2.1'},{name:'b',ip:null}]).state,'unknown');
});
test('HTTP samples exclude invalid values and track exit drift',()=>{
  const r=responseStats([{ip:'192.0.2.1',ms:10},{ip:'192.0.2.1',ms:30},{ip:'192.0.2.2',ms:20}]);
  assert.deepEqual(r,{count:3,median:20,range:20,drift:true});
  assert.equal(responseStats([null,{ip:'invalid',ms:0}]).median,null);
  assert.equal(responseStats([{ip:'192.0.2.1',ms:10},{ip:'192.0.2.1',ms:20}]).median,15);
});
test('geolocation deduplicates calls and enforces query budget',async()=>{
  let calls=0;const fetcher=async url=>{calls++;return new Response(JSON.stringify({success:true,ip:decodeURIComponent(new URL(url).pathname.slice(1)),country_code:'ZZ'}));};
  const geo=geoCache(null,fetcher,2);await Promise.all([geo('192.0.2.1'),geo('192.0.2.1'),geo('192.0.2.2')]);
  await assert.rejects(geo('192.0.2.3'));assert.equal(calls,6); // Two unique IPs, at most three documented providers per IP.
});
test('network orchestration: three DNS samples, independent ECS and CN candidate review',async()=>{
  let dnsCalls=0,ipv4Calls=0,geoCalls=0;
  const fetcher=async url=>{
    const u=new URL(url);let data;
    if(u.hostname==='api.ipify.org'){ipv4Calls++;data={ip:'192.0.2.1'};}
    else if(u.hostname==='api6.ipify.org')data={ip:'2001:db8::1'};
    else if(u.hostname==='edns.upset.dev'){dnsCalls++;data={dns:{ip:'192.0.2.53'},edns:{ip:'198.51.100.0/24'}};}
    else if(u.hostname==='ipwho.is'){geoCalls++;const ip=decodeURIComponent(u.pathname.slice(1));data={success:true,ip,country_code:ip==='192.0.2.99'?'CN':'ZZ',country:'Example',connection:{asn:64496,isp:'Example'}};}
    else return new Response('ip=192.0.2.1');
    return new Response(JSON.stringify(data));
  };
  class Peer{createDataChannel(){}createOffer(){return Promise.resolve({});}async setLocalDescription(){this.onicecandidate({candidate:{address:'192.0.2.99',type:'srflx'}});this.onicecandidate({candidate:null});}close(){}}
  const r=await runNetwork({fetcher,Peer,onResult:()=>{}});
  assert.equal(Object.keys(r).length,10);assert.equal(dnsCalls,3);assert.equal(ipv4Calls,3);assert.ok(geoCalls<=8);
  assert.equal(r.dns.state,'observed');assert.equal(r.ecs.state,'review');assert.equal(r.rtc.state,'review');assert.equal(r.egress.state,'observed');
});
test('offline keeps network failures unknown; absent RTC API is explicitly limited',async()=>{
  const fetcher=async()=>{throw new TypeError('Offline');};const results=await runNetwork({fetcher,Peer:null,onResult:()=>{}});
  assert.equal(Object.keys(results).length,10);assert.ok(Object.entries(results).every(([id,r])=>r.state===(id==='rtc'?'limited':'unknown')));
  const c=new AbortController();c.abort();
  const aborted=await runNetwork({signal:c.signal,fetcher:async(url,{signal})=>{throw signal.reason;},Peer:null,onResult:()=>{}});
  assert.ok(Object.values(aborted).every(r=>r.state==='unknown'));
});
test('Claude exit metadata belongs to its exact IP, independently of ordinary HTTP location',async()=>{
  const fetcher=async url=>{
    const u=new URL(url);
    if(u.hostname==='api.ipify.org')return new Response(JSON.stringify({ip:'192.0.2.1'}));
    if(u.hostname==='api6.ipify.org')throw new TypeError('No IPv6');
    if(u.hostname==='edns.upset.dev')return new Response(JSON.stringify({dns:{ip:'192.0.2.53'}}));
    if(u.hostname==='ipwho.is'){const ip=decodeURIComponent(u.pathname.slice(1));return new Response(JSON.stringify({success:true,ip,country_code:'ZZ',country:ip==='192.0.2.2'?'Claude Region':'Other Region',connection:{asn:64496,isp:'Example ISP'}}));}
    return new Response('ip=192.0.2.2');
  };
  const r=await runNetwork({fetcher,Peer:null,onResult:()=>{}});
  assert.equal(r.geo.rows.find(r=>r[0]==='地区')[1],'Other Region');
  for(const id of ['claude-ai','claude-com']){assert.equal(r[id].value,'192.0.2.2');assert.equal(r[id].rows.find(r=>r[0]==='地区')[1],'Claude Region');}
});
test('missing optional IPv6 does not invalidate obtained IPv4 exit agreement',()=>{
  const entries=[{name:'IPv4',ip:'192.0.2.1'},{name:'IPv6',ip:null,optional:true},{name:'claude.ai',ip:'192.0.2.1'},{name:'claude.com',ip:'192.0.2.1'}];
  assert.equal(compareExits(entries).state,'observed');entries[2].ip=null;assert.equal(compareExits(entries).state,'unknown');entries[2].ip='192.0.2.2';assert.equal(compareExits(entries).state,'review');
});

test('a required exit without a same-family peer stays unconfirmed',()=>{
  const entries=[{name:'IPv4',ip:'192.0.2.1'},{name:'Claude A',ip:'192.0.2.1'},{name:'Claude B',ip:'2001:db8::1'}];
  assert.equal(compareExits(entries).state,'unknown');
  assert.equal(compareExits(entries).value,'对照不足');
});
