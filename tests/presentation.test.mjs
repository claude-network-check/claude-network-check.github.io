import {test} from 'node:test';
import assert from 'node:assert/strict';
import {networkSummary,matchesFilter,evidenceGroup} from '../site/presentation.js';
import {checks,networkIDs} from '../site/catalog.js';
test('a low local score cannot turn an unknown or problematic network into a pass',()=>{
  const local={assessment:{state:'observed',score:0}};
  assert.equal(networkSummary(local,networkIDs).state,'idle');
  const r={...local,...Object.fromEntries(networkIDs.map(id=>[id,{state:'observed'}]))};
  r.ecs={state:'review'};r.rtc={state:'unknown'};
  assert.equal(networkSummary(r,networkIDs).state,'review');
  assert.equal(networkSummary(r,networkIDs).review,1);assert.equal(networkSummary(r,networkIDs).unknown,1);
  r.ecs={state:'observed'};assert.equal(networkSummary(r,networkIDs).state,'unknown');
  r.rtc={state:'observed'};assert.equal(networkSummary(r,networkIDs).state,'observed');
});
test('network report distinguishes pending, cancellation and no network scan',()=>{
  assert.equal(networkSummary({},networkIDs,true).state,'pending');
  const failed=Object.fromEntries(networkIDs.map(id=>[id,{state:'unknown'}]));
  assert.equal(networkSummary(failed,networkIDs,false,true).label,'已停止');
  assert.equal(networkSummary({},networkIDs).label,'未检测');
});
test('all 22 observations remain reachable in the three evidence groups and unknown filter',()=>{
  const groups=checks.reduce((r,c)=>(r[evidenceGroup(c)]=(r[evidenceGroup(c)]||0)+1,r),{});
  assert.deepEqual(groups,{network:10,region:6,device:6});
  for(const c of checks){assert.equal(matchesFilter(c,{state:'unknown'},'all'),true);assert.equal(matchesFilter(c,{state:'unknown'},'unknown'),true);assert.equal(matchesFilter(c,{state:'observed'},'unknown'),false);}
  assert.equal(matchesFilter(checks.find(c=>c.id==='dns'),{state:'review'},'review','DNS'),true);
  assert.equal(matchesFilter(checks.find(c=>c.id==='fonts'),null,'browser','字体'),true);
});

import {reportSummary,endpointView,recommendations} from '../site/presentation.js';
test('overall conclusion preserves incomplete and local-only scope even with a zero reference score',()=>{
  const r=Object.fromEntries(checks.map(c=>[c.id,{state:'observed'}]));r.assessment={score:0};
  assert.equal(reportSummary(r,checks).state,'observed');
  r.rtc={state:'unknown'};assert.equal(reportSummary(r,checks).state,'unknown');
  r.egress={state:'review'};assert.equal(reportSummary(r,checks).state,'review');
  assert.equal(reportSummary(r,checks,{running:true}).state,'pending');
  assert.match(reportSummary(r,checks,{localOnly:true}).title,/网络尚未验证/);
  const local=Object.fromEntries(checks.map(c=>[c.id,{state:c.group==='network'?'idle':'observed'}]));
  assert.equal(reportSummary(local,checks,{localOnly:true}).count,12);
  assert.equal(reportSummary({},checks).state,'idle');
});
test('endpoint display never substitutes an ordinary exit or invents location after a failure',()=>{
  assert.equal(endpointView({state:'unknown',value:'未取得结果'}).ip,'出口未取得');
  assert.equal(endpointView({state:'observed',value:'192.0.2.2',rows:[]}).location,'地区未确认');
  const view=endpointView({state:'observed',value:'192.0.2.2',rows:[['地区','Example B'],['运营商','Example ISP'],['ASN','AS64496']]});
  assert.equal(view.ip,'192.0.2.2');assert.equal(view.location,'Example B');assert.equal(view.provider,'Example ISP · AS64496');
});
test('repair suggestions link to evidence and group unavailable observations without labelling a leak',()=>{
  const items=recommendations({dns:{state:'unknown'},rtc:{state:'unknown'},ecs:{state:'review'}},checks);
  assert.equal(items.length,2);assert.equal(items[0].id,'ecs');assert.equal(items[0].href,'./guide.html#dns');
  assert.equal(items[1].state,'unknown');assert.match(items[1].title,/2 项未确认/);
  assert.deepEqual(recommendations({},checks),[]);
});
test('limited measurements remain visible and cannot yield an all-clear conclusion',()=>{
  const r=Object.fromEntries(checks.map(c=>[c.id,{state:'observed'}]));r.rtc={state:'limited'};
  const summary=reportSummary(r,checks);assert.equal(summary.state,'limited');assert.equal(summary.limited.length,1);
  assert.equal(matchesFilter(checks.find(c=>c.id==='rtc'),r.rtc,'limited'),true);
  r.dns={state:'unknown'};assert.equal(reportSummary(r,checks).state,'unknown');
});
