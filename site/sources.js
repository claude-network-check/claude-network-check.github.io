// Free, keyless, CORS-enabled data sources. Each adapter validates what it reads and throws on anything else.
import {normalizeIP, family, parseTrace, candidateAddresses, countryName} from './ip.js';

const cooldowns = new Map();

export async function request(url, {signal, timeout = 8000, format = 'json', fetcher = fetch} = {}) {
  const host = new URL(url).host.split('.').slice(-2).join('.');
  if ((cooldowns.get(host) || 0) > Date.now()) throw Object.assign(new Error('接口限流冷却中'), {status: 429, provider: host});
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, {once: true});
  const timer = setTimeout(() => controller.abort(new DOMException('请求超时', 'TimeoutError')), timeout);
  try {
    const response = await fetcher(url, {signal: controller.signal, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer'});
    if (!response.ok) {
      if (response.status === 429) cooldowns.set(host, Date.now() + 120000);
      throw Object.assign(new Error(`HTTP ${response.status}`), {status: response.status});
    }
    return await (format === 'text' ? response.text() : response.json());
  } catch (error) {
    const reason = controller.signal.aborted ? controller.signal.reason : error;
    throw Object.assign(new Error(reason?.message || String(reason)), {name: reason?.name || 'Error', status: reason?.status, provider: host});
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

const bail = signal => { if (signal?.aborted) throw signal.reason; };

const ipProviders = {
  4: [['https://ipv4.icanhazip.com/', 'text'], ['https://api.ipify.org?format=json', 'json'], ['https://4.ident.me/', 'text']],
  6: [['https://ipv6.icanhazip.com/', 'text'], ['https://api6.ipify.org?format=json', 'json'], ['https://6.ident.me/', 'text']]
};
/** Ordinary-website exit for one address family, with fallbacks. */
export async function publicIP(fam, {signal, fetcher} = {}) {
  for (const [url, format] of ipProviders[fam]) {
    try {
      const data = await request(url, {signal, fetcher, format, timeout: 5000});
      const ip = normalizeIP(format === 'text' ? data : data?.ip);
      if (ip && family(ip) === fam) return {ip, source: new URL(url).hostname};
    } catch { bail(signal); }
  }
  throw Object.assign(new Error(fam === 6 ? '没有可用的 IPv6 出口' : 'IPv4 回显服务均失败'), {code: fam === 6 ? 'NO_IPV6' : 'NO_IPV4'});
}

/** What Cloudflare in front of a Claude domain sees: exit IP, its country (loc), edge colo and round-trip time. */
export async function claudeTrace(domain, {signal, fetcher, now = () => performance.now()} = {}) {
  if (!['claude.ai', 'claude.com'].includes(domain)) throw new Error('不支持的域名');
  const start = now();
  const text = await request(`https://${domain}/cdn-cgi/trace`, {signal, fetcher, format: 'text'});
  return {...parseTrace(text), ms: Math.max(0, Math.round(now() - start))};
}

const geoProviders = [
  ['ipinfo.io', ip => `https://ipinfo.io/${ip}/json`, d => d?.country && {cc: d.country, city: d.city, asn: Number(d.org?.match(/^AS(\d+)/)?.[1]) || undefined, org: d.org?.replace(/^AS\d+\s*/, ''), timezone: d.timezone}],
  ['ipwho.is', ip => `https://ipwho.is/${ip}`, d => d?.success && d.country_code && {cc: d.country_code, city: d.city, asn: d.connection?.asn, org: d.connection?.isp || d.connection?.org, timezone: d.timezone?.id}],
  ['country.is', ip => `https://api.country.is/${ip}`, d => d?.country && {cc: d.country}]
];
/** IP → country, city, ASN, organisation and timezone. First provider that answers for this exact IP wins. */
export async function geoIP(ip, {signal, fetcher} = {}) {
  const target = normalizeIP(ip);
  if (!target) throw new Error('无效 IP');
  for (const [source, url, read] of geoProviders) {
    try {
      const data = await request(url(target), {signal, fetcher, timeout: 6000});
      if (data?.ip && normalizeIP(data.ip) !== target) continue;
      const g = read(data);
      if (g && /^[A-Z]{2}$/.test(g.cc)) return {...g, country: countryName(g.cc), source};
    } catch { bail(signal); }
  }
  throw Object.assign(new Error('归属查询服务均未取得结果'), {code: 'NO_GEO'});
}

/** Per-run memo with a hard budget so one scan never spends more than `limit` lookups. */
export function geoCache({signal, fetcher, limit = 10} = {}) {
  const cache = new Map();
  return ip => {
    const key = normalizeIP(ip);
    if (!key) return Promise.reject(new Error('无效 IP'));
    if (!cache.has(key)) {
      if (cache.size >= limit) return Promise.reject(new Error('归属查询预算已用完'));
      cache.set(key, geoIP(key, {signal, fetcher}));
    }
    return cache.get(key);
  };
}

/** IP type and anonymity flags from ipquery.io (free, keyless). Its own geolocation is ignored. */
export async function ipRisk(ip, {signal, fetcher} = {}) {
  const d = await request(`https://api.ipquery.io/${normalizeIP(ip)}?format=json`, {signal, fetcher, timeout: 6000});
  const r = d?.risk;
  if (!r || normalizeIP(d.ip) !== normalizeIP(ip)) throw new Error('风险数据不可用');
  return {datacenter: !!r.is_datacenter, vpn: !!r.is_vpn, proxy: !!r.is_proxy, tor: !!r.is_tor, mobile: !!r.is_mobile, score: Number.isFinite(r.risk_score) ? r.risk_score : null, source: 'ipquery.io'};
}

const label = () => [...crypto.getRandomValues(new Uint8Array(5))].map(b => b.toString(16).padStart(2, '0')).join('');
// Each request uses a fresh random hostname, so the resolver that looked it up is the one your system used.
export const dnsProviders = [
  {id: 'surfshark', count: 5, url: () => `https://${label()}.ipv4.surfsharkdns.com/`, read: d => Object.values(d || {}).map(r => ({ip: r.IP, cc: r.CountryCode, location: [r.Country, r.City].filter(Boolean).join(', '), isp: r.ISP}))},
  {id: 'fastly', count: 5, url: () => `https://${label()}.u.fastly-analytics.com/debug_resolver`, read: d => d?.dns_resolver_info ? [{ip: d.dns_resolver_info.ip, cc: d.dns_resolver_info.cc, isp: d.dns_resolver_info.as_name?.replace(/^[A-Z0-9-]+ - /, '').replace(/, [A-Z]{2}$/, '')}] : []},
  {id: 'browserleaks', count: 3, url: () => `https://${label()}.dns4.browserleaks.net/`, read: d => Object.entries(d || {}).map(([ip, r]) => ({ip, cc: r?.[0], location: r?.[1], isp: r?.[2]}))},
  {id: 'browserleaks6', count: 3, url: () => `https://${label()}.dns6.browserleaks.net/`, read: d => Object.entries(d || {}).map(([ip, r]) => ({ip, cc: r?.[0], location: r?.[1], isp: r?.[2]}))}
];
const detail = {surfshark: 3, browserleaks: 2, browserleaks6: 2, fastly: 1};

/** 16 lookups across four leak-test services; resolvers are merged by IP, keeping the most detailed record. */
export async function dnsLeak({signal, fetcher, providers = dnsProviders, onUpdate} = {}) {
  const merged = new Map();
  let ok = 0, total = 0;
  const jobs = providers.flatMap(p => Array.from({length: p.count}, () => (total++, request(p.url(), {signal, fetcher, timeout: 9000}).then(data => {
    ok++;
    for (const r of p.read(data)) {
      const ip = normalizeIP(r.ip);
      if (!ip) continue;
      const cc = /^[A-Z]{2}$/i.test(r.cc || '') ? r.cc.toUpperCase() : null;
      const prev = merged.get(ip);
      const entry = {ip, cc, country: countryName(cc), location: r.location || '', isp: r.isp || '', sources: new Set(prev?.sources), rank: detail[p.id]};
      entry.sources.add(p.id.replace(/6$/, ''));
      merged.set(ip, !prev || entry.rank > prev.rank ? entry : {...prev, sources: entry.sources, cc: prev.cc || cc});
    }
    onUpdate?.(snapshot());
  }).catch(() => bail(signal)))));
  const snapshot = () => ({ok, total, resolvers: [...merged.values()].map(({rank, sources, ...r}) => ({...r, sources: [...sources]}))});
  await Promise.all(jobs);
  return snapshot();
}

// Mainland STUN servers come first: if your rules send Chinese domains DIRECT, they reveal the real line.
export const stunServers = ['stun:stun.chat.bilibili.com:3478', 'stun:stun.miwifi.com:3478', 'stun:stun.hitv.com:3478', 'stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'];

export function webRTC({signal, Peer = globalThis.RTCPeerConnection, timeout = 5000, servers = stunServers} = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    if (typeof Peer !== 'function') return reject(Object.assign(new Error('浏览器未开放 WebRTC'), {code: 'NO_RTC'}));
    const found = new Map();
    let peer, timer, done = false;
    const finish = error => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (peer) { peer.onicecandidate = null; try { peer.close(); } catch {} }
      error ? reject(error) : resolve({candidates: [...found.values()]});
    };
    const abort = () => finish(signal.reason);
    try {
      peer = new Peer({iceServers: servers.map(urls => ({urls}))});
      signal?.addEventListener('abort', abort, {once: true});
      timer = setTimeout(() => finish(), timeout);
      peer.onicecandidate = event => {
        if (!event.candidate) return finish();
        for (const c of candidateAddresses(event.candidate.candidate)) {
          const key = `${c.address}|${c.type}`;
          if (!found.has(key)) found.set(key, c);
        }
      };
      peer.createDataChannel('probe');
      peer.createOffer().then(offer => !done && peer.setLocalDescription(offer)).catch(finish);
    } catch (error) { finish(error); }
  });
}
