import {publicIP,geoIP,trace,dns,webRTC} from './probes.js';
import {normalizeIP,compareRTC} from './core.js';
import {networkIDs} from './catalog.js';
const result=(state,value,summary,rows=[])=>({state,value,summary,rows});
export function unknownResult(error){
  const code=error?.code;
  const value=error?.name==='AbortError'?'检测已停止':error?.name==='TimeoutError'?'请求超时':error?.status===429?'接口限流':code==='IPV6_UNREACHABLE'?'两处 IPv6 探测未连通':code==='IP_ECHO_FAILED'?'两处 IP 回显均失败':code==='GEO_UNAVAILABLE'?'归属服务暂不可用':code==='RTC_UNAVAILABLE'?'浏览器未开放 WebRTC':error?.status?`服务返回 HTTP ${error.status}`:'请求未能读取';
  const description=code==='RTC_UNAVAILABLE'?'当前页面没有可用的 WebRTC API，无法采集地址；可能由浏览器策略或扩展限制，不判定为无泄露。':code==='IPV6_UNREACHABLE'?'ipify 和 ident.me 的 IPv6-only 请求均未成功。不能据此断言整台设备没有 IPv6。':error?.name==='AbortError'?'已停止，未完成的检测没有结论。':error?.status===429?'该服务触发限流，冷却期内不会重复调用。':'请结合数据来源检查连接与浏览器限制；跨域读取失败无法单独区分 CORS 和网络阻断。';
  return result(code==='RTC_UNAVAILABLE'?'limited':'unknown',value,description,error?.provider?[['失败服务',error.provider]]:[]);
}
export function compareExits(entries){
  const valid=entries.filter(e=>normalizeIP(e.ip)).map(e=>({...e,ip:normalizeIP(e.ip)}));
  const groups=[valid.filter(e=>!e.ip.includes(':')),valid.filter(e=>e.ip.includes(':'))];
  const differing=groups.some(g=>g.length>1&&new Set(g.map(e=>e.ip)).size>1);
  const comparable=groups.some(g=>g.length>1);
  const unmatched=valid.some(e=>!e.optional&&groups.find(g=>g.includes(e)).length<2);
  return result(differing?'review':!comparable||unmatched||entries.some(e=>!e.optional&&!normalizeIP(e.ip))?'unknown':'observed',differing?'发现不同出口':comparable&&!unmatched?'已取得样本内一致':'对照不足','仅对已取得的同协议族地址做比较；IPv6 未取得时不否定 IPv4 对照。不同出口可能来自合法分流，不等于已确认泄露。',valid.map(e=>[`${e.name} IP`,e.ip]));
}
export function responseStats(samples){
  const valid=samples.filter(s=>s&&Number.isFinite(s.ms)&&s.ms>=0&&normalizeIP(s.ip));
  const sorted=valid.map(s=>s.ms).sort((a,b)=>a-b);
  const median=sorted.length?(sorted[Math.floor((sorted.length-1)/2)]+sorted[Math.floor(sorted.length/2)])/2:null;
  const drift=new Set(valid.map(s=>normalizeIP(s.ip))).size>1;
  return {count:valid.length,median,range:sorted.length?sorted.at(-1)-sorted[0]:null,drift};
}
/** Bounded per-run geolocation cache, with a strict query budget. Never infer country from an IP prefix. */
export function geoCache(signal,fetcher,limit=8){
  const cache=new Map();
  return ip=>{const normalized=normalizeIP(ip);if(!normalized)return Promise.reject(new Error('Invalid IP'));if(!cache.has(normalized)){if(cache.size>=limit)return Promise.reject(new Error('Geo lookup budget reached'));cache.set(normalized,geoIP(normalized,signal,fetcher));}return cache.get(normalized);};
}
export async function runNetwork({signal,onResult,fetcher,Peer,now=()=>performance.now()}){
  const results={},geo=geoCache(signal,fetcher);
  const emit=(id,r)=>{results[id]=r;onResult(id,r);return r;};
  const fail=(id,e)=>emit(id,unknownResult(e));
  const measuredIP=async()=>{const start=now();const data=await publicIP(4,signal,fetcher);return {...data,ms:Math.max(0,now()-start)};};
  const v4=measuredIP().then(d=>{emit('ipv4',result('observed',d.ip,'本次 HTTP IPv4 出口。',[['出口 IP',d.ip]]));return d;}).catch(e=>{fail('ipv4',e);return null;});
  const v6=publicIP(6,signal,fetcher).then(d=>{emit('ipv6',result('observed',d.ip,'已观察到 IPv6 出口；请核对是否符合配置。',[['出口 IP',d.ip]]));return d;}).catch(async e=>{const baseline=await v4;if(baseline&&e.code==='IPV6_UNREACHABLE')emit('ipv6',{...unknownResult(e),state:'limited'});else fail('ipv6',e);return null;});
  const traces=['ai','com'].map(suffix=>trace(`claude.${suffix}`,signal,fetcher).then(d=>{emit(`claude-${suffix}`,result('observed',d.ip,'只验证该域名的诊断请求出口，不验证登录、付费 API 或账号可用性。',[[`claude.${suffix} IP`,d.ip]]));return d;}).catch(e=>{fail(`claude-${suffix}`,e);return null;}));
  // Keep Claude's metadata attached to its own address, never borrow the ordinary HTTP exit's location.
  const traceGeoTask=Promise.all(traces.map(async (promise,i)=>{
    const d=await promise;if(!d)return;
    const id=`claude-${['ai','com'][i]}`,base=results[id];
    try{const g=await geo(d.ip);emit(id,{...base,rows:[...base.rows,['地区',[g.country,g.city].filter(Boolean).join(' · ')||'未提供'],['国家代码',g.countryCode||'未提供'],['运营商',g.isp||'未提供'],['ASN',g.asn?`AS${g.asn}`:'未提供'],['查询来源',g.source||'未提供']]});}
    catch{emit(id,{...base,rows:[...base.rows,['归属查询','未能确认；出口地址已取得']]});}
  }));
  const geoTask=Promise.all([v4,v6]).then(async([a,b])=>{const ip=a?.ip||b?.ip;if(!ip){emit('geo',result('unknown','无可用出口','没有 HTTP IP，无法查询归属。'));return;}try{const g=await geo(ip);const location=[g.country,g.city].filter(Boolean).join(' · ');emit('geo',result(g.countryCode==='CN'?'review':g.countryCode?'observed':'unknown',location||'归属未提供','IP 数据库归属不等于实际物理位置，也不是住宅 IP 或信誉认证。',[['查询 IP',ip],['国家代码',g.countryCode||'未提供'],['地区',location||'未提供'],['ASN',g.asn?`AS${g.asn}`:'未提供'],['运营商',g.isp||'未提供'],['归属时区',g.timezone||'未提供'],['查询来源',g.source||'未提供']]));}catch(e){fail('geo',e);}});
  const egressTask=Promise.all([v4,v6,...traces]).then(values=>emit('egress',compareExits(values.map((v,i)=>({name:['IPv4','IPv6','claude.ai','claude.com'][i],ip:v?.ip,optional:i===1})))));
  const dnsTask=Promise.allSettled([dns(signal,fetcher),dns(signal,fetcher),dns(signal,fetcher)]).then(async values=>{
    const samples=values.filter(v=>v.status==='fulfilled').map(v=>v.value);
    const resolvers=[...new Set(samples.map(s=>s.resolver))];
    const subnets=[...new Set(samples.map(s=>s.ecs).filter(Boolean))];
    const all=samples.length===3;
    if(!samples.length){const error=values.find(v=>v.status==='rejected')?.reason;fail('dns',error);fail('ecs',error);return;}
    emit('ecs',result(subnets.length?'review':all?'observed':'unknown',subnets.length?`${subnets.length} 条子网信息`:all?'本次未报告 ECS':'样本不完整','ECS 可能关联出口、解析器或客户端子网；携带 ECS 不等于已经确认暴露真实家庭 IP。',subnets.length?subnets.map((s,i)=>[`ECS 子网 ${i+1}`,s]):[['成功样本',`${samples.length} / 3`]]));
    const enriched=await Promise.all(resolvers.map(async ip=>{try{return {ip,...await geo(ip)};}catch{return {ip};}}));
    const cn=enriched.filter(r=>r.countryCode==='CN'),missing=enriched.some(r=>!r.countryCode);
    const rows=[['成功样本',`${samples.length} / 3`],['解析器数量',resolvers.length]];
    enriched.forEach((g,i)=>{rows.push([`解析器 IP ${i+1}`,g.ip],[`归属 ${i+1}`,[g.country,g.isp].filter(Boolean).join(' · ')||'未能查询']);});
    emit('dns',result(cn.length?'review':!all||missing?'unknown':'observed',`${resolvers.length} 个解析器${cn.length?' · 含 CN 归属':''}`,'三次随机域名查询，仅覆盖此次浏览器解析路径。Anycast 归属未必是实际位置；CN 归属是核对线索，不能单独证明泄露。',rows));
  });
  const rtcTask=webRTC(signal,{Peer}).then(async d=>{
    const ips=(await Promise.all([v4,v6,...traces])).map(v=>v?.ip).filter(Boolean);
    const comparison=compareRTC(d.candidates,ips);
    const publicCandidates=d.candidates.filter(c=>c.kind==='public');
    const unique=[...new Set(publicCandidates.map(c=>c.address))];
    const enriched=await Promise.all(unique.slice(0,3).map(async ip=>{try{return {ip,...await geo(ip)};}catch{return {ip};}}));
    const cn=enriched.some(g=>g.countryCode==='CN');
    const rows=d.candidates.map((c,i)=>[`候选 ${i+1} · ${c.kind}`,`${c.address} (${c.type})`]);
    enriched.forEach((g,i)=>rows.push([`公网候选归属 ${i+1}`,[g.country,g.isp].filter(Boolean).join(' · ')||'未能查询']));
    if(unique.length>3)rows.push(['归属查询覆盖','只查询前三个公网地址']);
    if(!rows.length)rows.push(['候选数量','0']);
    const incomplete=unique.length>3||enriched.some(g=>!g.countryCode);
    const state=cn?'review':comparison.state==='observed'&&incomplete?'unknown':comparison.state;
    emit('rtc',result(state,d.candidates.length?`${d.candidates.length} 个候选${cn?' · 含 CN 归属':''}`:'未采集到公网地址',`${comparison.message}${incomplete?' 部分候选的地区归属未能确认。':''}`,rows));
  }).catch(e=>fail('rtc',e));
  const stabilityTask=v4.then(async first=>{
    if(!first){emit('stability',result('unknown','无基准样本','首次 IPv4 请求失败，跳过额外采样。'));return;}
    const extra=await Promise.allSettled([measuredIP(),measuredIP()]);
    const samples=[first,...extra.map(v=>v.status==='fulfilled'?v.value:null)];
    const stats=responseStats(samples);
    emit('stability',result(stats.drift?'review':stats.count<3?'unknown':'observed',stats.count?`中位耗时 ${Math.round(stats.median)} ms`:'未取得结果','包含 DNS、TLS、HTTP 和服务处理的总耗时，不是 ICMP 延迟或带宽测试。三次样本不能代表长期稳定性；备用服务切换也会影响耗时。',[['成功样本',`${stats.count} / 3`],['耗时差值',stats.range===null?'未知':`${Math.round(stats.range)} ms`],['样本出口',stats.drift?'发生变化':'成功样本内一致'],...samples.map((s,i)=>[`请求 ${i+1}`,s?`${Math.round(s.ms)} ms · ${s.source}`:'未取得结果'])]));
  });
  await Promise.allSettled([v4,v6,...traces,traceGeoTask,geoTask,egressTask,dnsTask,rtcTask,stabilityTask]);
  // Adapter failures must never leave a spinner or turn into a false pass.
  for(const id of networkIDs)if(!results[id])fail(id,new Error('Incomplete check'));
  return results;
}
