/** Normalize only IP literals; never accept a hostname or an integer-as-IP. */
export function normalizeIP(value) {
  if (typeof value !== 'string') return null;
  const s = value.trim().toLowerCase();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) {
    const parts = s.split('.');
    return parts.every(p => Number(p) <= 255 && (p === '0' || !p.startsWith('0'))) ? parts.join('.') : null;
  }
  if (!s.includes(':') || !/^[\da-f:.]+$/.test(s)) return null;
  try {
    const host = new URL(`http://[${s}]/`).hostname.slice(1, -1);
    if (host.startsWith('::ffff:')) {
      const tail = host.slice(7).split(':');
      if (tail.length === 2) return tail.flatMap(p => [parseInt(p, 16) >> 8, parseInt(p, 16) & 255]).join('.');
    }
    return host;
  } catch { return null; }
}

export function addressKind(value) {
  if (typeof value === 'string' && value.toLowerCase().endsWith('.local')) return 'mdns';
  const ip = normalizeIP(value);
  if (!ip) return 'invalid';
  if (!ip.includes(':')) {
    const [a,b] = ip.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224) return 'local';
  } else if (ip === '::' || ip === '::1' || /^(fc|fd)/.test(ip) || /^fe[89ab]/.test(ip) || ip.startsWith('ff')) return 'local';
  return 'public';
}

export function parseTrace(text) {
  const ip = text.split(/\r?\n/).find(l => l.startsWith('ip='))?.slice(3);
  const normalized = normalizeIP(ip);
  if (!normalized) throw new Error('响应中没有有效 IP');
  return {ip: normalized};
}

export function parseDNS(data) {
  const resolver = normalizeIP(data?.dns?.ip);
  if (!resolver) throw new Error('DNS 服务响应结构已变化或没有观测到解析器');
  const ecsRaw = data?.edns?.ip;
  let ecs = null;
  if (ecsRaw != null && ecsRaw !== '') {
    if (typeof ecsRaw !== 'string') throw new Error('ECS 响应结构无法识别');
    const [ip, prefix, ...rest] = ecsRaw.split('/');
    const normalized = normalizeIP(ip);
    if (!normalized || rest.length || (prefix !== undefined && (!/^\d+$/.test(prefix) || Number(prefix) > (normalized.includes(':') ? 128 : 32)))) throw new Error('ECS 响应结构无法识别');
    ecs = normalized + (prefix === undefined ? '' : `/${prefix}`);
  }
  return {resolver, ecs};
}

export function parseCandidate(candidate) {
  const fields = candidate?.candidate?.trim().split(/\s+/) || [];
  const address = candidate?.address || fields[4];
  const kind = addressKind(address);
  if (kind === 'invalid') return null;
  return {address: normalizeIP(address) || address.toLowerCase(), kind, type: candidate?.type || fields[fields.indexOf('typ') + 1] || 'unknown'};
}

/** Compare only matching address families; a different IP is evidence of a different exit, not proof of a leak. */
export function compareRTC(candidates, httpIPs) {
  const baseline = httpIPs.map(normalizeIP).filter(Boolean);
  const publicIPs = [...new Set(candidates.filter(c => c.kind === 'public').map(c => normalizeIP(c.address)).filter(Boolean))];
  if (!publicIPs.length) return {state:'limited', message:'本次未采集到公网候选；浏览器策略、UDP 路径或 STUN 可达性可能限制了采集。这是本次观测结果，不是无泄露保证。'};
  const comparable = publicIPs.filter(ip => baseline.some(b => b.includes(':') === ip.includes(':')));
  const different = comparable.filter(ip => !baseline.includes(ip));
  if (different.length) return {state:'review', message:'WebRTC 与 HTTP 出口存在差异，请核对代理策略、多出口和 IPv6 路径。差异不等于已确认泄露。'};
  if (comparable.length !== publicIPs.length) return {state:'unknown', message:'部分地址缺少同协议族的 HTTP 对照，无法完整比较。'};
  return {state:'observed', message:'本次采集的公网候选与已观测 HTTP 出口一致；不代表其他应用或未来连接。'};
}

/** Original, explicit regional heuristic. Not IPPure's algorithm or any service's risk model. */
export function environmentScore(env) {
  const signals = [
    {label:'时区标识', value:env.timezone, weight:40, hit:['Asia/Shanghai','Asia/Chongqing','Asia/Chungking','Asia/Harbin','Asia/Urumqi','PRC'].includes(env.timezone)},
    {label:'首选语言', value:env.languages?.[0], weight:30, hit:/^zh(?:-|$)/i.test(env.languages?.[0] || '')},
    {label:'Intl 地区', value:env.locale, weight:20, hit:/^zh(?:-|$)/i.test(env.locale || '')},
    {label:'UTC 偏移', value:env.offset === undefined ? undefined : `UTC${env.offset >= 0 ? '+' : ''}${env.offset / 60}`, weight:10, hit:env.offset === 480}
  ];
  const complete = signals.every(s => s.value !== undefined && s.value !== '');
  return {score:complete ? signals.reduce((n,s) => n + (s.hit ? s.weight : 0),0) : null, signals};
}

/** Export only known result fields. Never serialize raw provider responses or errors. */
export function safeReport(results) {
  const items = Object.entries(results).map(([id,r]) => ({
    check:id, state:r.state, summary:redactText(r.summary || ''),
    observations:(r.rows || []).map(([label,value]) => [label, /IP|地址|解析器|候选|子网|出口/.test(label) ? '[已隐藏]' : redactText(String(value))])
  }));
  return {schema:1, generatedAt:new Date().toISOString(), note:'IP 与地址字段已隐藏；语言、时区和运营商等仍可能具有识别性，请审阅后分享。', items};
}
export function redactText(text) {
  return text.replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?:\/\d+)?\b/g,'[IP 已隐藏]').replace(/\b[a-z\d-]+\.local\b/gi,'[mDNS 已隐藏]').replace(/(?<!\w)(?:[\da-f]{0,4}:){2,}[\da-f:.]*(?:\/\d+)?/gi,'[IPv6 已隐藏]');
}
