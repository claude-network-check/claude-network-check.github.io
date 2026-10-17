import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeIP,addressKind,parseTrace,parseDNS,parseCandidate,compareRTC,environmentScore,safeReport} from '../site/core.js';

test('IP literals: canonical IPv6, mapped IPv4, reject invalid and hostnames',()=>{
  assert.equal(normalizeIP('2001:0db8:0000::1'),'2001:db8::1');
  assert.equal(normalizeIP('::ffff:c000:201'),'192.0.2.1');
  for(const s of ['999.1.1.1','127.01.0.1','example.com','127.1','2130706433','a:b','1.2.3.4/path'])assert.equal(normalizeIP(s),null);
});
test('local IPv4, IPv6, CGNAT and mDNS are not called public',()=>{
  for(const s of ['127.0.0.1','172.16.0.1','10.0.0.1','192.168.1.1','100.64.1.1','fe80::1','fd00::1','::1','::ffff:192.168.1.1'])assert.equal(addressKind(s),'local');
  assert.equal(addressKind('random.local'),'mdns');assert.equal(addressKind('192.0.2.1'),'public');
});
test('trace and DNS adapters reject unknown response schemas',()=>{
  assert.deepEqual(parseTrace('fl=abc\nip=192.0.2.4\nloc=XX'),{ip:'192.0.2.4'});
  assert.throws(()=>parseTrace('<html>Denied</html>'));
  assert.deepEqual(parseDNS({dns:{ip:'192.0.2.2'},edns:{ip:'198.51.100.0/24'}}),{resolver:'192.0.2.2',ecs:'198.51.100.0/24'});
  assert.equal(parseDNS({dns:{ip:'2001:db8::1'}}).ecs,null);
  assert.throws(()=>parseDNS({dns:{ip:'nope'}}));assert.throws(()=>parseDNS({dns:{ip:'192.0.2.1'},edns:{ip:'198.51.100.0/99'}}));
});
test('ICE parser extracts literal or mDNS addresses without raw candidate storage',()=>{
  assert.deepEqual(parseCandidate({candidate:'candidate:1 1 udp 1 192.0.2.1 999 typ srflx raddr 10.0.0.1'}),{address:'192.0.2.1',kind:'public',type:'srflx'});
  assert.equal(parseCandidate({address:'abc.local',type:'host'}).kind,'mdns');
  assert.equal(parseCandidate({candidate:'malformed'}),null);
});
test('RTC no candidates is limited; missing comparison remains unknown',()=>{
  assert.equal(compareRTC([],['192.0.2.1']).state,'limited');
  const c=address=>({address,kind:'public'});
  assert.equal(compareRTC([c('2001:db8::1')],['192.0.2.1']).state,'unknown');
  assert.equal(compareRTC([c('192.0.2.1')],[]).state,'unknown');
  assert.equal(compareRTC([c('192.0.2.1')],['192.0.2.2']).state,'review');
  assert.equal(compareRTC([c('2001:db8::1')],['2001:0db8::1']).state,'observed');
});
test('transparent score handles missing fields, preference and UTC+8 false positives',()=>{
  assert.equal(environmentScore({}).score,null);
  assert.equal(environmentScore({timezone:'Asia/Shanghai',languages:['zh-CN'],locale:'zh-CN',offset:480}).score,100);
  assert.equal(environmentScore({timezone:'Asia/Manila',languages:['en'],locale:'en',offset:480}).score,10);
  assert.equal(environmentScore({timezone:'Etc/UTC',languages:['en'],locale:'en',offset:0}).score,0);
});
test('report allowlist excludes raw responses and removes IPv4, IPv6, ECS, mDNS',()=>{
  const r=safeReport({dns:{state:'review',summary:'192.0.2.1 and 2001:db8::1',rows:[['ECS 子网','198.51.100.0/24'],['候选','abc.local'],['other','::1']],raw:{secret:'NEVER_EXPORT'}}});
  const s=JSON.stringify(r);for(const privateValue of ['192.0.2.1','2001:db8::1','198.51.100.0','abc.local','::1','NEVER_EXPORT'])assert.ok(!s.includes(privateValue));
});
