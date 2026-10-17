// View semantics are independent of the regional reference index.
export function networkSummary(results,ids,running=false,stopped=false){
  const settled=ids.filter(id=>results[id]&&results[id].state!=='pending');
  const review=settled.filter(id=>results[id].state==='review').length;
  const unknown=settled.filter(id=>results[id].state==='unknown').length;
  if(!settled.length&&!running)return {state:'idle',title:'尚未检查网络',label:'未检测',description:'本地分数不代表网络路径安全。',review,unknown};
  if(running)return {state:'pending',title:'正在核对网络路径',label:'检测中',description:`已完成 ${settled.length} / ${ids.length} 项，结果将逐项更新。`,review,unknown};
  if(review)return {state:'review',title:'网络仍需核对',label:stopped?'已停止':'需核对',description:'出口差异或地址暴露线索，需要结合代理配置判断。',review,unknown};
  if(unknown||settled.length<ids.length)return {state:'unknown',title:'网络信息不完整',label:stopped?'已停止':'未确认',description:'部分观测无法取得，不能据此判定没有泄露。',review,unknown};
  if(settled.some(id=>results[id].state==='limited'))return {state:'limited',title:'部分检测受限',label:'检测受限',description:'未能完成的验证没有被判定为安全。',review,unknown};
  return {state:'observed',title:'未标记网络异常',label:'已完成',description:'请确认观测值符合预期；单次结果不是安全保证。',review,unknown};
}
export const regionIDs=['timezone','languages','fonts','locale','offset','emoji'];
export function evidenceGroup(check){return check.group==='network'?'network':regionIDs.includes(check.id)?'region':'device';}
export function matchesFilter(check,data,filter,query=''){
  const group=filter==='all'||filter===check.group||(['review','unknown','limited'].includes(filter)&&data?.state===filter);
  return group&&`${check.name} ${check.hint}`.toLowerCase().includes(query.trim().toLowerCase());
}

// A reference score never upgrades missing evidence into a clean report.
export function reportSummary(results,checks,{running=false,localOnly=false,stopped=false}={}){
  const settled=checks.filter(c=>results[c.id]&&!['pending','idle'].includes(results[c.id].state));
  const review=settled.filter(c=>results[c.id].state==='review');
  const unknown=settled.filter(c=>results[c.id].state==='unknown');
  const limited=settled.filter(c=>results[c.id].state==='limited');
  const count=settled.length;
  if(running)return {state:'pending',title:'正在核对出口与环境…',description:`已取得 ${count} / ${checks.length} 项结果，关键观测会实时更新。`,count,review,unknown,limited};
  if(!count)return {state:'idle',title:'确认你的 Claude 出口与隐私状态',description:'一次检查网络出口、地址暴露和地区线索，给出需要优先处理的问题。',count,review,unknown,limited};
  if(localOnly)return {state:'unknown',title:'浏览器已检查，网络尚未验证',description:review.length?`本地有 ${review.length} 项需核对。运行全面检测，确认 Claude 出口、DNS 和 WebRTC。`:'运行全面检测，确认 Claude 出口、DNS 和 WebRTC；本地分数不能代表网络状态。',count,review,unknown,limited};
  if(review.length)return {state:'review',title:`发现 ${review.length} 项需要核对的问题`,description:`${review.slice(0,2).map(c=>c.name).join('、')}。${unknown.length?`另有 ${unknown.length} 项未确认。`:''}${stopped?'本轮已停止。':''}`,count,review,unknown,limited};
  if(unknown.length||count<checks.length)return {state:'unknown',title:stopped?'检测已停止，结论尚不完整':'部分信息未取得，暂不能排除异常',description:`${unknown.length} 项未确认。请查看失败原因；未知结果不会被视为通过。`,count,review,unknown,limited};
  if(limited.length)return {state:'limited',title:'主要结果已取得，部分检测受限',description:`${limited.map(c=>c.name).join('、')}未能完成全部验证，具体限制见下方。未把这些项目判为安全。`,count,review,unknown,limited};
  return {state:'observed',title:'本次未标记已检测项异常',description:'请确认出口与环境值符合预期。本结果不代表账号安全或登录、对话可用。',count,review,unknown,limited};
}
export function rowValue(result,label){return result?.rows?.find(row=>row[0]===label)?.[1]??null;}
export function endpointView(result){
  const state=result?.state||'idle';
  const ip=state==='observed'?result.value:state==='pending'?'正在检测…':state==='idle'?'等待检测':'出口未取得';
  // Only metadata attached to this exact endpoint may be displayed here.
  return {state,ip,location:rowValue(result,'地区')|| (state==='idle'?'国家 / 地区 · 待查询':'地区未确认'),provider:[rowValue(result,'运营商'),rowValue(result,'ASN')].filter(v=>v&&v!=='未提供').join(' · ')|| (state==='idle'?'运营商 / ASN · 待查询':'运营商 / ASN 未确认')};
}
const advice={
  egress:['核对 Claude 与普通网页的出口','不同出口可能由规则分流产生。确认 Claude 相关域名是否走预期节点，再重测。','routing'],
  rtc:['核对 WebRTC 公网候选','对照候选地址与代理出口；检查浏览器 WebRTC 策略及 UDP 路径。','browser'],
  geo:['核对出口的地区归属','检查代理最终出口与 IP 数据库归属。数据库标注不能单独证明物理位置。','routing'],
  dns:['核对 DNS 解析路径','检查 DNS 分流与加密解析器的出站路径；解析器地区只是核对线索。','dns'],
  ecs:['核对 DNS 携带的子网','检查 ECS 子网属于哪个网络；携带 ECS 不等于真实家庭地址已被暴露。','dns'],
  'timezone-match':['核对时区覆盖设置','浏览器声明时区和实际偏移存在差异，检查浏览器覆盖与系统时间设置。','browser'],
  'language-match':['核对语言与区域偏好','首选语言和格式化语言不同；确认是否为你有意设置的偏好。','browser'],
  stability:['核对出口是否在轮换','采样中的出口发生变化。检查节点自动切换或上游代理轮换。','routing']
};
export function recommendations(results,checks){
  const reviews=checks.filter(c=>results[c.id]?.state==='review');
  const priority=['egress','rtc','geo','dns','ecs','stability','timezone-match','language-match'];
  reviews.sort((a,b)=>(priority.indexOf(a.id)<0?99:priority.indexOf(a.id))-(priority.indexOf(b.id)<0?99:priority.indexOf(b.id)));
  const items=reviews.map(c=>{const [title,description,anchor]=advice[c.id]||[`核对${c.name}`,results[c.id].summary,'verify'];return {id:c.id,state:'review',title,description,href:`./guide.html#${anchor}`};});
  const unknown=checks.filter(c=>results[c.id]?.state==='unknown');
  if(unknown.length)items.push({id:unknown[0].id,state:'unknown',title:`补齐 ${unknown.length} 项未确认的观测`,description:`${unknown.slice(0,3).map(c=>c.name).join('、')}${unknown.length>3?'等':''}未能完整确认。展开证据查看超时、限流或浏览器限制，再决定是否重测。`,href:'./guide.html#verify'});
  return items;
}
