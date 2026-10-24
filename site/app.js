import {collectLocal} from './local.js';
import {claudeTrace, publicIP, geoCache, ipRisk, dnsLeak, webRTC} from './sources.js';
import {exitRegion, exitConsistency, assessDNS, assessRTC, timezoneMatch, riskLabel, findings, verdict} from './assess.js';
import {maskIP, countryName} from './ip.js';

const $ = id => document.getElementById(id);
const domains = [['claude.ai', '应用'], ['claude.com', '官网']];
const steps = ['claude.ai', 'claude.com', 'v4', 'v6', 'risk', 'dns', 'rtc'];
const bandText = {low: '低风险', medium: '中风险', high: '高风险'};
const bandState = {low: 'ok', medium: 'warn', high: 'risk'};
const signalIcons = {timezone: 'clock', languages: 'lang', fonts: 'type', locale: 'sliders', offset: 'offset', emoji: 'smile'};
let state, controller, masked = false, dnsExpanded = false;

/* ---------- DOM helpers: all external strings go through textContent ---------- */
function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key.startsWith('data-')) node.setAttribute(key, value);
    else node[key] = value;
  }
  node.append(...children.flat().filter(c => c != null && c !== false));
  return node;
}
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS(svg.namespaceURI, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.append(use);
  return svg;
}
const ip = value => (masked ? maskIP(value) : value);
const cc = (code, risky) => h('span', {class: 'cc', 'data-state': risky ? 'risk' : null}, code || '??');
const tag = (state, text) => h('span', {class: 'tag', 'data-state': state}, text);
const skeletons = n => Array.from({length: n}, () => h('li', {class: 'skeleton'}));
function fact(label, value, {state, sub, mono} = {}) {
  return h('div', {class: 'fact', 'data-state': state}, h('dt', {}, label), h('dd', {}, h('span', {class: mono ? 'mono' : null}, value), sub && h('span', {class: 'sub'}, sub)));
}
function setState(el, stateName, text) { el.dataset.state = stateName; if (text !== undefined) el.textContent = text; }
function errText(e) {
  if (e?.name === 'TimeoutError') return '请求超时';
  if (e?.status === 429) return '接口限流';
  if (e?.status) return `HTTP ${e.status}`;
  return '请求失败或被拦截';
}

/* ---------- Run ---------- */
async function run() {
  controller?.abort(new DOMException('重新检测', 'AbortError'));
  controller = new AbortController();
  const {signal} = controller;
  const s = state = {trace: {}, geo: {}, v4: null, v6: null, risk: null, dnsRaw: null, rtcRaw: null, done: {}, finished: false, startedAt: new Date()};
  const local = collectLocal();
  s.env = local;
  s.device = local.device;
  dnsExpanded = false;
  document.body.classList.add('running');
  $('copy').disabled = true;
  render();

  const update = () => { if (s === state) render(); };
  const mark = key => { s.done[key] = true; update(); };
  const geo = geoCache({signal});
  const lookup = async address => {
    try { s.geo[address] = await geo(address); } catch { s.geo[address] ??= null; }
    update();
  };

  const traces = domains.map(([domain]) => claudeTrace(domain, {signal})
    .then(async t => { s.trace[domain] = t; update(); await lookup(t.ip); })
    .catch(e => { s.trace[domain] = {error: errText(e)}; })
    .finally(() => mark(domain)));
  const v4 = publicIP(4, {signal}).then(r => { s.v4 = r; }).catch(e => { s.v4 = {error: errText(e)}; }).finally(() => mark('v4'));
  const v6 = publicIP(6, {signal}).then(async r => { s.v6 = r; update(); await lookup(r.ip); })
    .catch(e => { s.v6 = {none: e.code === 'NO_IPV6', error: errText(e)}; }).finally(() => mark('v6'));
  const risk = Promise.all([...traces, v4]).then(async () => {
    const target = s.trace['claude.ai']?.ip || s.trace['claude.com']?.ip || s.v4?.ip;
    if (!target) return;
    try { s.risk = await ipRisk(target, {signal}); } catch { s.risk = {error: true}; }
  }).finally(() => mark('risk'));
  const dns = dnsLeak({signal, onUpdate: snap => { s.dnsRaw = snap; update(); }})
    .then(r => { s.dnsRaw = r; })
    .catch(() => { s.dnsRaw ??= {ok: 0, total: 16, resolvers: []}; })
    .finally(() => mark('dns'));
  const rtc = webRTC({signal}).then(async r => {
    await Promise.all([...traces, v4, v6]);
    const publics = [...new Set(r.candidates.filter(c => c.kind === 'public').map(c => c.address))].slice(0, 4);
    await Promise.all(publics.filter(a => !(a in s.geo)).map(lookup));
    s.rtcRaw = r;
  }).catch(e => { s.rtcRaw = {error: e.code === 'NO_RTC' ? 'blocked' : errText(e)}; }).finally(() => mark('rtc'));

  await Promise.allSettled([...traces, v4, v6, risk, dns, rtc]);
  if (s !== state) return;
  s.finished = true;
  document.body.classList.remove('running');
  $('copy').disabled = false;
  render();
}

/* ---------- Derived view model ---------- */
function derive(s) {
  const ai = s.trace['claude.ai'], com = s.trace['claude.com'];
  const primary = ai?.ip ? ai : com?.ip ? com : null;
  const exits = [ai?.ip, com?.ip, s.v4?.ip, s.v6?.ip].filter(Boolean);
  const ipTimezone = primary ? s.geo[primary.ip]?.timezone : null;
  return {
    ai, com, primary, ipTimezone,
    region: primary ? exitRegion(primary, s.geo[primary.ip]) : null,
    consistency: s.done['claude.ai'] && s.done['claude.com'] && s.done.v4 ? exitConsistency([ai?.ip, com?.ip, s.v4?.ip].map(a => ({ip: a}))) : null,
    ipv6: s.v6,
    ipv6Region: s.v6?.ip && s.geo[s.v6.ip] ? exitRegion(null, s.geo[s.v6.ip]) : null,
    dns: s.dnsRaw ? assessDNS(s.dnsRaw) : null,
    rtc: s.rtcRaw?.candidates ? assessRTC(s.rtcRaw.candidates, exits, a => s.geo[a]) : null,
    timezone: s.done['claude.ai'] && s.done['claude.com'] ? timezoneMatch(s.env.raw.timezone, ipTimezone) : null,
    risk: s.risk?.error ? null : s.risk,
    env: s.env, device: s.device
  };
}

/* ---------- Render ---------- */
function render() {
  const s = state, d = derive(s);
  const list = findings(d);
  renderSummary(s, d, list);
  renderExit(s, d);
  renderDNS(s, d);
  renderRTC(s, d);
  renderEnv(d.env);
  renderDevice(s, d);
}

function exitStatus(s, d) {
  if (!s.done['claude.ai'] && !s.done['claude.com'] && !d.primary) return ['pending', '检测中', '读取 trace'];
  if (!d.primary) return s.done['claude.ai'] && s.done['claude.com'] ? ['unknown', '无法连接', 'Claude trace 请求失败'] : ['pending', '检测中', '读取 trace'];
  const {cc: code, supported} = d.region;
  const name = code ? `${code} ${countryName(code)}` : '地区未知';
  if (supported === false) return ['risk', name, '不在 Claude 支持地区'];
  if (d.consistency?.state === 'warn') return ['warn', name, `${d.consistency.distinct.length} 个不同出口`];
  return [supported ? 'ok' : 'unknown', name, supported ? '支持地区' : '地区未确认'];
}
function dnsStatus(s, d) {
  const n = d.dns?.total || 0;
  if (!s.done.dns) return ['pending', n ? `${n} 个解析器` : '检测中', `${s.dnsRaw?.ok || 0} / 16 次查询`];
  if (d.dns.state === 'risk') return ['risk', `${d.dns.leaked.length} 个国内 DNS`, `共 ${n} 个解析器`];
  if (d.dns.state === 'ok') return ['ok', '未泄露', `${n} 个解析器 · ${[...new Set(s.dnsRaw.resolvers.map(r => r.cc).filter(Boolean))].slice(0, 4).join(' ')}`];
  return ['unknown', '未知', '查询均失败'];
}
function rtcStatus(s, d) {
  if (!s.done.rtc) return ['pending', '检测中', '5 个 STUN'];
  if (s.rtcRaw?.error === 'blocked') return ['ok', '已禁用', '浏览器未开放 WebRTC'];
  if (s.rtcRaw?.error) return ['unknown', '未知', s.rtcRaw.error];
  const {state: st, items} = d.rtc;
  if (st === 'risk') return ['risk', 'CN IP 暴露', `${items.filter(i => i.leaked).length} 个中国大陆地址`];
  if (st === 'warn') return ['warn', '地址不一致', '公网地址不同于出口'];
  return ['ok', items.length ? '与出口一致' : '未暴露', items.length ? `${items.length} 个公网地址` : '无公网候选'];
}

function renderSummary(s, d, list) {
  const done = steps.filter(k => s.done[k]).length;
  $('progress-bar').style.width = `${Math.max(6, (done / steps.length) * 100)}%`;
  const v = verdict(list, s.finished);
  const summary = $('summary');
  summary.dataset.level = v.level;
  $('verdict-badge').replaceChildren(icon({running: 'spin', ok: 'ok', warn: 'warn', risk: 'risk'}[v.level]), h('span', {}, {running: '检测中', ok: '环境良好', warn: '需要注意', risk: '高风险'}[v.level]));
  const place = d.region?.cc && countryName(d.region.cc);
  // A clean result reads as a sentence about what Claude sees; problems lead with their count.
  if (v.level === 'ok' && place) $('verdict-title').replaceChildren('Claude 眼中的你，来自', h('em', {}, place));
  else $('verdict-title').textContent = v.title;
  $('verdict-text').textContent = v.level === 'ok' && place ? `出口在支持地区，DNS 与 WebRTC 没有泄露，中文环境特征 ${d.env.total} 分（${bandText[d.env.band]}）。` : v.text;
  $('progress-text').textContent = s.finished ? `检测完成 · ${s.startedAt.toLocaleTimeString('zh-CN', {hour12: false})}` : `正在检测 · ${done} / ${steps.length}`;
  const tiles = [['tile-exit', exitStatus(s, d)], ['tile-dns', dnsStatus(s, d)], ['tile-rtc', rtcStatus(s, d)],
    ['tile-env', [bandState[d.env.band], `${d.env.total} / 100`, bandText[d.env.band]]]];
  for (const [id, [st, value, sub]] of tiles) {
    const tile = $(id);
    tile.dataset.state = st;
    tile.querySelector('.tile-value').textContent = value;
    tile.querySelector('.tile-sub').textContent = sub;
  }
  const ol = $('findings');
  ol.hidden = !list.length;
  ol.replaceChildren(...list.map(f => h('li', {class: 'finding', 'data-state': f.severity},
    icon(f.severity === 'risk' ? 'risk' : f.severity === 'warn' ? 'warn' : 'info'),
    h('div', {}, h('strong', {}, f.title), h('p', {}, f.detail)),
    f.href && h('a', {href: f.href}, f.severity === 'info' ? '了解更多' : '怎么修复', icon('arrow')))));
}

function renderExit(s, d) {
  const [st, text] = exitStatus(s, d);
  setState($('exit-pill'), st, st === 'pending' ? '检测中' : st === 'risk' ? '不支持地区' : st === 'warn' ? '出口不一致' : st === 'ok' ? '支持地区' : '未知');
  for (const [domain, role] of domains) {
    const el = $(`ep-${domain}`), t = s.trace[domain], g = t?.ip ? s.geo[t.ip] : null;
    const region = t?.ip ? exitRegion(t, g) : null;
    el.dataset.state = !t ? 'pending' : t.error ? 'unknown' : region.supported === false ? 'risk' : 'ok';
    const top = h('div', {class: 'ep-top'}, h('span', {}, h('span', {class: 'ep-domain'}, domain), ' ', h('span', {class: 'ep-latency'}, role)), t?.ms != null && h('span', {class: 'ep-latency'}, `${t.ms} ms`));
    if (!t) { el.replaceChildren(top, h('span', {class: 'ep-ip'}, '检测中…'), h('div', {class: 'ep-meta'}, '读取 /cdn-cgi/trace')); continue; }
    if (t.error) { el.replaceChildren(top, h('span', {class: 'ep-ip'}, '无法连接'), h('div', {class: 'ep-meta'}, `${t.error}。可能被扩展、防火墙拦截，或 Claude 域名未走代理。`)); continue; }
    el.replaceChildren(top, h('span', {class: 'ep-ip'}, ip(t.ip)),
      h('div', {class: 'ep-geo'}, cc(region.cc, region.supported === false), h('span', {}, [countryName(region.cc), g?.city].filter(Boolean).join(' · ') || '地区未知'),
        region.supported != null && tag(region.supported ? 'ok' : 'risk', region.supported ? '支持地区' : '不支持地区')),
      h('div', {class: 'ep-meta'}, [g?.asn && `AS${g.asn}`, g?.org].filter(Boolean).join(' · ') || (s.geo[t.ip] === undefined ? '查询运营商…' : '运营商未知')),
      h('div', {class: 'ep-meta'}, `Cloudflare 节点 ${t.colo || '—'}${t.warp === 'on' ? ' · WARP' : ''}`));
  }
  const facts = [];
  const v4 = s.v4, aiIP = d.primary?.ip;
  facts.push(fact('普通网页 IPv4', !v4 ? '检测中…' : v4.ip ? ip(v4.ip) : v4.error, {mono: !!v4?.ip, state: v4?.ip && aiIP ? (v4.ip === aiIP ? 'ok' : 'warn') : null, sub: v4?.ip && aiIP ? (v4.ip === aiIP ? '与 Claude 一致' : '与 Claude 不同') : null}));
  const v6 = s.v6, g6 = v6?.ip ? s.geo[v6.ip] : null;
  facts.push(fact('IPv6 出口', !v6 ? '检测中…' : v6.ip ? ip(v6.ip) : v6.none ? '未检测到' : v6.error, {mono: !!v6?.ip, state: d.ipv6Region?.supported === false ? 'risk' : v6?.ip ? 'ok' : null, sub: g6 ? `${g6.cc} ${g6.country}` : v6?.none ? '没有 IPv6 也不会泄露' : null}));
  const c = d.consistency;
  facts.push(fact('出口一致性', !c ? '检测中…' : c.state === 'ok' ? '全部一致' : c.state === 'warn' ? `${c.distinct.length} 个不同出口` : '对照不足', {state: c?.state === 'ok' ? 'ok' : c?.state === 'warn' ? 'warn' : null, sub: c ? 'claude.ai / claude.com / 普通网页' : null}));
  const label = riskLabel(d.risk);
  facts.push(fact('IP 类型', !s.done.risk ? '检测中…' : label ? label.type : '未知', {state: label ? (label.type === '机房 IP' ? 'info' : 'ok') : null, sub: label ? 'ipquery.io' : null}));
  facts.push(fact('匿名网络标记', !s.done.risk ? '检测中…' : label ? (label.flags.length ? label.flags.join(' / ') : '未标记') : '未知', {state: label ? (label.flags.length ? 'warn' : 'ok') : null, sub: label ? 'VPN · 代理 · Tor' : null}));
  facts.push(fact('地区判定来源', d.region?.source || (d.primary ? '—' : '检测中…'), {sub: d.region?.source === 'Cloudflare' ? 'Claude 前端自己返回的国家代码' : d.region?.source ? 'IP 数据库' : null}));
  $('exit-facts').replaceChildren(...facts);
}

function renderDNS(s, d) {
  const [st] = dnsStatus(s, d);
  setState($('dns-pill'), st, st === 'pending' ? '检测中' : st === 'risk' ? '中国 DNS 泄露' : st === 'ok' ? '未泄露' : '未知');
  const list = $('dns-list'), more = $('dns-more');
  const resolvers = [...(s.dnsRaw?.resolvers || [])].sort((a, b) => (b.cc === 'CN') - (a.cc === 'CN') || (a.cc || 'ZZ').localeCompare(b.cc || 'ZZ') || a.ip.localeCompare(b.ip));
  if (!resolvers.length) {
    list.replaceChildren(...(s.done.dns ? [h('li', {class: 'empty'}, '16 次查询均未返回结果，可能被浏览器扩展或网络拦截。结果未知，不代表没有泄露。')] : skeletons(3)));
    more.hidden = true;
  } else {
    const shown = dnsExpanded ? resolvers : resolvers.slice(0, 6);
    list.replaceChildren(...shown.map(r => h('li', {class: 'row', 'data-state': r.cc === 'CN' ? 'risk' : null},
      cc(r.cc, r.cc === 'CN'),
      h('div', {class: 'row-main'}, h('div', {class: 'row-ip'}, ip(r.ip)), h('div', {class: 'row-sub'}, [r.location || r.country, r.isp].filter(Boolean).join(' · ') || '归属未知')),
      r.cc === 'CN' ? tag('risk', '中国 DNS') : tag('ok', '境外'))));
    more.hidden = resolvers.length <= 6;
    more.textContent = dnsExpanded ? '收起' : `显示全部 ${resolvers.length} 个解析器`;
  }
  const raw = s.dnsRaw;
  $('dns-note').textContent = `每次请求使用随机子域名，由 Surfshark、Fastly、BrowserLeaks 的权威 DNS 记录是哪个解析器来查询。${raw ? `本次成功 ${raw.ok} / ${raw.total} 次。` : ''}`;
}

function renderRTC(s, d) {
  const [st] = rtcStatus(s, d);
  setState($('rtc-pill'), st, st === 'pending' ? '检测中' : st === 'risk' ? 'CN IP 暴露' : st === 'warn' ? '需核对' : st === 'ok' ? '未发现泄露' : '未知');
  const list = $('rtc-list');
  if (!s.done.rtc) { list.replaceChildren(...skeletons(2)); return; }
  if (s.rtcRaw?.error === 'blocked') { list.replaceChildren(h('li', {class: 'empty'}, '浏览器没有开放 WebRTC（被禁用或被扩展拦截），网页无法通过它获取你的 IP。')); return; }
  if (s.rtcRaw?.error) { list.replaceChildren(h('li', {class: 'empty'}, `WebRTC 检测失败：${s.rtcRaw.error}`)); return; }
  const {items, local} = d.rtc;
  if (!items.length) {
    list.replaceChildren(h('li', {class: 'empty'}, `没有采集到公网地址：WebRTC 的 UDP 已被禁用或已经走代理。${local ? `另有 ${local} 个本地 / mDNS 候选，不会暴露公网 IP。` : ''}`));
    return;
  }
  list.replaceChildren(...items.map(i => h('li', {class: 'row', 'data-state': i.leaked ? 'risk' : i.differs ? 'warn' : null},
    cc(i.geo?.cc, i.leaked),
    h('div', {class: 'row-main'}, h('div', {class: 'row-ip'}, ip(i.address)), h('div', {class: 'row-sub'}, [i.geo?.country, i.geo?.org, i.type].filter(Boolean).join(' · '))),
    i.leaked ? tag('risk', 'CN 真实 IP') : i.differs ? tag('warn', '不同于出口') : tag('ok', '与出口一致'))));
}

function renderEnv(env) {
  $('score').textContent = env.total;
  $('gauge').dataset.band = env.band;
  $('gauge-fill').style.strokeDashoffset = String(326.73 * (1 - env.total / 100));
  const band = $('score-band');
  band.dataset.state = bandState[env.band];
  band.textContent = env.band === 'low' ? `${bandText.low} · 不像中国用户` : env.band === 'medium' ? `${bandText.medium} · 有部分中文特征` : `${bandText.high} · 很像中国用户`;
  setState($('env-pill'), bandState[env.band], bandText[env.band]);
  const hits = env.signals.filter(x => x.hit);
  $('hits').replaceChildren(...(hits.length ? hits.map(x => h('span', {class: 'hit'}, x.name, h('b', {}, `+${Math.round(x.points)}`))) : [h('span', {class: 'hit'}, '没有命中的信号')]));
  $('signals').replaceChildren(...env.signals.map(x => h('li', {class: 'signal', 'data-hit': String(x.hit)},
    h('span', {class: 'signal-icon'}, icon(signalIcons[x.id])),
    h('div', {}, h('div', {class: 'signal-name'}, x.name, h('span', {class: 'weight'}, `权重 ${x.weight}`), x.claude && h('span', {class: 'claude-tag'}, 'Claude Code 读取')),
      h('div', {class: 'signal-desc'}, x.desc), h('div', {class: 'signal-value'}, x.value)),
    h('div', {class: 'signal-points'}, h('strong', {}, `+${Math.round(x.points)}`), h('span', {class: 'bar'}, h('i', {style: `width:${x.score * 100}%`}))))));
}

function renderDevice(s, d) {
  const {raw} = d.env, dev = d.device, tz = d.timezone;
  $('device-facts').replaceChildren(
    fact('时区 vs 出口 IP', !tz ? '检测中…' : tz.state === 'ok' ? (tz.exact ? '一致' : '偏移相同') : tz.state === 'warn' ? '不一致' : '无法对照', {state: tz?.state === 'ok' ? 'ok' : tz?.state === 'warn' ? 'warn' : null, sub: `${raw.timezone || '?'} / ${d.ipTimezone || '?'}`}),
    fact('浏览器语言', raw.languages[0] || '不可读取', {sub: raw.languages.slice(1, 4).join(', ') || null, mono: true}),
    fact('区域设置', raw.locale || '不可读取', {mono: true}),
    fact('时区声明自洽', dev.tzOffsetConsistent == null ? '无法判断' : dev.tzOffsetConsistent ? '一致' : '不一致', {state: dev.tzOffsetConsistent === false ? 'warn' : dev.tzOffsetConsistent ? 'ok' : null, sub: dev.tzOffsetConsistent === false ? '时区与偏移对不上，可能被插件篡改' : 'IANA 时区与 UTC 偏移'}),
    fact('系统 / 浏览器', `${dev.os} · ${dev.browser}`),
    fact('WebGL 渲染器', dev.renderer || '不可读取', {sub: null}),
    fact('屏幕', dev.screen || '不可读取', {sub: dev.cores ? `${dev.cores} 线程 CPU` : null}),
    fact('自动化标记', dev.webdriver ? '检测到 webdriver' : '未检测到', {state: dev.webdriver ? 'warn' : 'ok'})
  );
}

/* ---------- Report ---------- */
function report() {
  const s = state, d = derive(s), list = findings(d), v = verdict(list, true);
  const pick = f => f(s, d).slice(1).join(' · ');
  const lines = [
    `Claude 环境检测报告 · ${s.startedAt.toLocaleString('zh-CN', {hour12: false})}`,
    `结论：${v.title}`,
    `Claude 出口：${pick(exitStatus)}${d.ai?.ms != null ? ` · claude.ai ${d.ai.ms} ms` : ''}`,
    `DNS：${pick(dnsStatus)}`,
    `WebRTC：${pick(rtcStatus)}`,
    `中文环境特征：${d.env.total} / 100（${bandText[d.env.band]}）`,
    ...d.env.signals.map(x => `  · ${x.name}：${x.value}  +${Math.round(x.points)}`),
    ...(list.length ? ['问题：', ...list.map((f, i) => `  ${i + 1}. ${f.title}`)] : []),
    '（IP 地址已省略）',
    location.origin + location.pathname
  ];
  return lines.join('\n');
}

$('rerun').addEventListener('click', run);
$('mask').addEventListener('click', event => {
  masked = !masked;
  const button = event.currentTarget;
  button.setAttribute('aria-pressed', String(masked));
  button.replaceChildren(icon(masked ? 'eye' : 'eye-off'), h('span', {}, masked ? '显示 IP' : '隐藏 IP'));
  render();
});
$('copy').addEventListener('click', async event => {
  const label = event.currentTarget.querySelector('span');
  try { await navigator.clipboard.writeText(report()); label.textContent = '已复制'; }
  catch { label.textContent = '复制失败'; }
  setTimeout(() => { label.textContent = '复制报告'; }, 2000);
});
$('dns-more').addEventListener('click', () => { dnsExpanded = !dnsExpanded; render(); });

run();
