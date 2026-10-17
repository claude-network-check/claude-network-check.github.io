import {normalizeIP, parseTrace, parseDNS, parseCandidate} from './core.js';

const cooldowns=new Map();

export async function request(url, {signal, timeout=12000, format='json', fetcher=fetch}={}) {
  const host=new URL(url).host;
  const until=cooldowns.get(host)||0;
  if(until>Date.now()){const error=new Error('接口仍在限流冷却期');error.status=429;error.retryAfter=String(Math.ceil((until-Date.now())/1000));throw error;}
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  signal?.addEventListener('abort',abort,{once:true});
  const timer = setTimeout(()=>controller.abort(new DOMException('检测超时','TimeoutError')),timeout);
  try {
    const response = await fetcher(url,{signal:controller.signal,credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
    if (!response.ok) {
      const error = new Error(response.status === 429 ? '接口限流，请稍后再试' : `服务返回 HTTP ${response.status}`);
      error.status=response.status;
      error.retryAfter=response.headers.get('Retry-After');
      if(response.status===429){const seconds=Number(error.retryAfter);const time=error.retryAfter&&(Number.isFinite(seconds)?Date.now()+seconds*1000:Date.parse(error.retryAfter));cooldowns.set(host,time>Date.now()?time:Date.now()+(host==='ipwho.is'?86400000:60000));}
      throw error;
    }
    return await (format === 'text' ? response.text() : response.json());
  } catch(error) { const raw=controller.signal.aborted?controller.signal.reason:error;const reason=new Error(typeof raw?.message==='string'?raw.message:String(raw??'Request failed'));reason.name=raw?.name||(controller.signal.aborted?'AbortError':'Error');for(const key of ['status','retryAfter','code'])if(raw?.[key]!==undefined)reason[key]=raw[key];reason.provider=host;throw reason; } finally { clearTimeout(timer); signal?.removeEventListener('abort',abort); }
}
function aborted(signal,error){if(signal?.aborted)throw signal.reason||error;}
export async function publicIP(family, signal, fetcher) {
  const providers=family===6?[['https://api6.ipify.org?format=json','json'],['https://6.ident.me/','text']]:[['https://api.ipify.org?format=json','json'],['https://4.ident.me/','text']];
  const failures=[];
  for(const [url,format] of providers){
    try{const data=await request(url,{signal,fetcher,format,timeout:6000});const ip=normalizeIP(format==='text'?data:data?.ip);if(!ip||(ip.includes(':')?6:4)!==family)throw new Error('地址格式或协议族不匹配');return {ip,source:new URL(url).hostname};}
    catch(error){aborted(signal,error);failures.push(error);}
  }
  const error=new Error('两处地址探测均未取得结果');error.code=family===6?'IPV6_UNREACHABLE':'IP_ECHO_FAILED';error.providers=providers.map(([url])=>new URL(url).hostname);throw error;
}
// In-memory only; do not repeatedly spend anonymous quotas for the same address.
const geoCaches=new WeakMap();
export async function geoIP(ip,signal,fetcher=fetch) {
  const normalized=normalizeIP(ip);if(!normalized)throw new Error('归属查询需要有效 IP');
  if(signal?.aborted)throw signal.reason;
  let cache=geoCaches.get(fetcher);if(!cache){cache=new Map();geoCaches.set(fetcher,cache);}
  const previous=cache.get(normalized);if(previous&&previous.until>Date.now())return previous.value;
  const countryTask=(async()=>{try{
    const d=await request(`https://api.country.is/${encodeURIComponent(normalized)}`,{signal,fetcher,timeout:5000});
    if(normalizeIP(d?.ip)!==normalized||! /^[A-Z]{2}$/.test(d.country))throw new Error('国家查询响应不匹配');
    let name=d.country;try{name=new Intl.DisplayNames(['zh-CN'],{type:'region'}).of(d.country);}catch{}
    return {country:name,countryCode:d.country,source:'country.is'};
  }catch(error){aborted(signal,error);return null;}})();
  const detailTask=(async()=>{
    try{const d=await request(`https://api.ipapi.is/?q=${encodeURIComponent(normalized)}`,{signal,fetcher,timeout:5000});
      if(normalizeIP(d?.ip)!==normalized||typeof d.country!=='string')throw new Error('基础归属响应不匹配');
      return {country:d.country,city:d.city,asn:typeof d.asn==='string'?Number(d.asn.match(/^AS(\d+)/)?.[1])||undefined:d.asn?.asn,isp:typeof d.company==='string'?d.company:undefined,timezone:typeof d.timezone==='string'?d.timezone:undefined,source:'ipapi.is (anonymous)'};
    }catch(error){aborted(signal,error);}
    try{const d=await request(`https://ipwho.is/${encodeURIComponent(normalized)}`,{signal,fetcher,timeout:5000});
      if(d?.success!==true||normalizeIP(d.ip)!==normalized)throw new Error('备用归属响应不匹配');
      return {country:d.country,countryCode:d.country_code,city:d.city,asn:d.connection?.asn,isp:d.connection?.isp,timezone:d.timezone?.id,source:'ipwho.is'};
    }catch(error){aborted(signal,error);return null;}
  })();
  const [country,detail]=await Promise.all([countryTask,detailTask]);
  if(!country&&!detail){const error=new Error('归属查询服务均未取得结果');error.code='GEO_UNAVAILABLE';throw error;}
  const value={...detail,...country,source:[country?.source,detail?.source].filter(Boolean).join(' + '),partial:!detail};
  cache.set(normalized,{value,until:Date.now()+300000});return value;
}
export async function trace(domain,signal,fetcher) {
  if (!['claude.ai','claude.com'].includes(domain)) throw new Error('不支持的探测域名');
  return parseTrace(await request(`https://${domain}/cdn-cgi/trace`,{signal,fetcher,format:'text'}));
}
export async function dns(signal,fetcher) {return parseDNS(await request('https://edns.upset.dev/',{signal,fetcher}));}

export function webRTC(signal,{Peer=globalThis.RTCPeerConnection,timeout=7000}={}) {
  return new Promise((resolve,reject)=>{
    if (signal?.aborted) {reject(signal.reason || new DOMException('已取消','AbortError'));return;}
    if (!Peer) {const error=new Error('当前浏览器未开放 WebRTC API');error.code='RTC_UNAVAILABLE';reject(error);return;}
    let peer, timer, done=false;
    const candidates=[];
    const finish=(error)=>{
      if(done)return; done=true; clearTimeout(timer);
      signal?.removeEventListener('abort',abort);
      if(peer){peer.onicecandidate=null;peer.onicegatheringstatechange=null;peer.close();}
      error?reject(error):resolve({candidates});
    };
    const abort=()=>finish(signal.reason || new DOMException('已取消','AbortError'));
    try {
      peer=new Peer({iceServers:[{urls:'stun:stun.cloudflare.com:3478'}],iceCandidatePoolSize:0});
      signal?.addEventListener('abort',abort,{once:true});
      timer=setTimeout(()=>finish(),timeout);
      peer.onicecandidate=event=>{
        if(!event.candidate){finish();return;}
        const candidate=parseCandidate(event.candidate);
        if(candidate && !candidates.some(c=>c.address===candidate.address && c.type===candidate.type))candidates.push(candidate);
      };
      peer.createDataChannel('diagnostic');
      peer.createOffer().then(offer=>{if(!done)return peer.setLocalDescription(offer);}).catch(finish);
    } catch(e){finish(e);}
  });
}
