// Pure judgement layer: raw observations in, states and findings out. No DOM, no network.
import {normalizeIP, family} from './ip.js';
import {isSupported} from './regions.js';
import {chinaZones, zoneOffset} from './local.js';

/** Region Claude sees: Cloudflare's own `loc` from the trace, falling back to the geo database. */
export function exitRegion(trace, geo) {
  const cc = trace?.loc || geo?.cc || null;
  return {cc, supported: isSupported(cc), source: trace?.loc ? 'Cloudflare' : geo?.cc ? geo.source : null};
}

/** Compare exits within each address family only. */
export function exitConsistency(entries) {
  const valid = entries.map(e => ({...e, ip: normalizeIP(e.ip)})).filter(e => e.ip);
  const v4 = valid.filter(e => family(e.ip) === 4);
  const distinct = new Set(v4.map(e => e.ip));
  if (v4.length < 2) return {state: 'unknown', distinct: [...distinct]};
  return {state: distinct.size === 1 ? 'ok' : 'warn', distinct: [...distinct]};
}

/** CN resolvers are a leak (same rule as IPPure); none observed yet is unknown, never "safe". */
export function assessDNS({resolvers = [], ok = 0} = {}) {
  if (!resolvers.length) return {state: ok ? 'unknown' : 'error', leaked: [], total: 0};
  const leaked = resolvers.filter(r => r.cc === 'CN');
  return {state: leaked.length ? 'risk' : 'ok', leaked, total: resolvers.length};
}

/**
 * Public ICE candidates: CN → leak; outside every HTTP exit → review; otherwise matches the proxy.
 * No public candidate means WebRTC is blocked or proxied, which is the desired outcome but not proof.
 */
export function assessRTC(candidates, exitIPs, geoOf = () => null) {
  const exits = new Set(exitIPs.map(normalizeIP).filter(Boolean));
  const items = candidates.filter(c => c.kind === 'public').map(c => {
    const geo = geoOf(c.address);
    const sameFamily = [...exits].some(ip => family(ip) === family(c.address));
    return {...c, geo, leaked: geo?.cc === 'CN', differs: sameFamily && !exits.has(c.address)};
  });
  const unique = [...new Map(items.map(i => [i.address, i])).values()];
  const state = unique.some(i => i.leaked) ? 'risk' : unique.some(i => i.differs) ? 'warn' : 'ok';
  return {state, items: unique, local: candidates.filter(c => c.kind !== 'public').length};
}

/** Browser timezone vs. the exit IP's timezone: same zone, same current offset, or a mismatch. */
export function timezoneMatch(browserTz, ipTz, date = new Date()) {
  if (!browserTz || !ipTz) return {state: 'unknown'};
  if (browserTz === ipTz) return {state: 'ok', exact: true};
  try { return zoneOffset(browserTz, date) === zoneOffset(ipTz, date) ? {state: 'ok', exact: false} : {state: 'warn'}; }
  catch { return {state: 'unknown'}; }
}

export function riskLabel(risk) {
  if (!risk) return null;
  const flags = [risk.vpn && 'VPN', risk.proxy && '代理', risk.tor && 'Tor'].filter(Boolean);
  return {type: risk.mobile ? '移动网络' : risk.datacenter ? '机房 IP' : '住宅 / ISP', flags};
}

const fix = {
  region: './guide.html#routing', dns: './guide.html#dns', rtc: './guide.html#browser', tz: './guide.html#browser',
  lang: './guide.html#browser', exit: './guide.html#tun', ip: './guide.html#routing', ipv6: './guide.html#tun'
};

/**
 * Turn every finished section into findings. severity: risk > warn > info.
 * `s` holds whatever has completed; missing sections simply produce no finding.
 */
export function findings(s) {
  const out = [];
  const add = (severity, id, title, detail) => out.push({severity, id, title, detail, href: fix[id]});
  const region = s.region;
  if (region?.supported === false) add('risk', 'region', `Claude 出口位于不支持的地区（${region.cc}）`, 'Claude 只在支持地区提供服务。把 Claude 相关域名路由到支持地区的固定出口。');
  if (s.dns?.state === 'risk') add('risk', 'dns', `检测到 ${s.dns.leaked.length} 个中国大陆 DNS 解析器`, '系统 DNS 请求没有走代理，访问记录会暴露给国内解析器。启用代理客户端的 DNS 接管或 fake-ip，并关闭系统 DNS 直连。');
  if (s.rtc?.state === 'risk') add('risk', 'rtc', 'WebRTC 暴露了中国大陆 IP', '浏览器通过 UDP 绕过代理，暴露了真实线路。用 TUN 模式接管 UDP，或把浏览器 WebRTC 策略设为 disable_non_proxied_udp。');
  if (chinaZones.includes(s.env?.raw?.timezone)) add('risk', 'tz', `系统时区为 ${s.env.raw.timezone}`, 'Claude Code 会读取这个系统时区。把系统时区改为出口所在地的时区（例如 Asia/Singapore）。');
  if (s.env?.band === 'high') add('risk', 'lang', `中文环境特征 ${s.env.total} 分（高）`, '时区、语言和区域设置共同呈现中国大陆用户特征。按下方信号逐项调整。');
  else if (s.env?.band === 'medium') add('warn', 'lang', `中文环境特征 ${s.env.total} 分（中）`, '部分浏览器信号指向中文环境。优先调整命中的高权重信号：时区、首选语言、区域设置。');
  if (s.ipv6?.ip && s.ipv6Region?.supported === false) add('risk', 'ipv6', `IPv6 出口位于不支持的地区（${s.ipv6Region.cc}）`, 'IPv6 流量绕过了代理。在代理客户端开启 IPv6 接管，或在系统中关闭 IPv6。');
  if (s.consistency?.state === 'warn') add('warn', 'exit', `检测到 ${s.consistency.distinct.length} 个不同的 IPv4 出口`, 'claude.ai、claude.com 与普通网页的出口不一致，说明分流规则把它们发往不同节点。让 Claude 相关域名使用同一个固定出口。');
  if (s.rtc?.state === 'warn') add('warn', 'rtc', 'WebRTC 公网地址与代理出口不同', '浏览器通过另一条线路发出了 UDP。确认该地址是否为你的另一个代理出口；不是的话，按 WebRTC 泄露处理。');
  if (s.timezone?.state === 'warn') add('warn', 'tz', '浏览器时区与出口 IP 所在时区不一致', `浏览器 ${s.env?.raw?.timezone || '未知'}，出口 IP ${s.ipTimezone || '未知'}。让系统时区与出口地区保持一致。`);
  const label = riskLabel(s.risk);
  if (label?.flags.length) add('warn', 'ip', `出口 IP 被标记为 ${label.flags.join(' / ')}`, '数据库把这个地址识别为匿名网络出口，更容易触发风控。考虑更换为干净的 ISP / 住宅出口。');
  else if (label?.type === '机房 IP') add('info', 'ip', '出口是机房 IP', '机房 IP 本身可以正常使用 Claude，但不如住宅 / ISP 出口稳定。是否更换取决于你的风险偏好。');
  if (s.device?.webdriver) add('info', 'lang', '浏览器处于自动化控制状态', 'navigator.webdriver 为 true，通常由自动化工具引起。日常使用的浏览器不应出现。');
  const order = {risk: 0, warn: 1, info: 2};
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

export function verdict(list, done) {
  const risk = list.filter(f => f.severity === 'risk').length, warn = list.filter(f => f.severity === 'warn').length;
  if (!done) return {level: 'running', title: '正在检测…', text: '本地信号已就绪，网络检测仍在进行。'};
  if (risk) return {level: 'risk', title: `发现 ${risk} 个高风险问题`, text: warn ? `另有 ${warn} 项需要注意。先处理高风险项。` : '按下方建议处理后重新检测。'};
  if (warn) return {level: 'warn', title: `${warn} 项需要注意`, text: '没有高风险问题，但有不一致或可改进的地方。'};
  return {level: 'ok', title: '环境良好', text: '出口地区、DNS、WebRTC 与浏览器信号均未发现问题。'};
}
