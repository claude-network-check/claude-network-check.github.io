import {test} from 'node:test';
import assert from 'node:assert/strict';
import {request, publicIP, claudeTrace, geoIP, geoCache, ipRisk, dnsLeak, webRTC} from '../site/sources.js';

const json = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}}));
const text = (body, status = 200) => Promise.resolve(new Response(body, {status}));
function router(routes) {
  const calls = [];
  const fetcher = (url, init) => {
    calls.push(url);
    assert.equal(init.credentials, 'omit');
    for (const [pattern, reply] of routes) if (pattern.test(url)) return reply(url);
    return Promise.reject(new TypeError('Failed to fetch'));
  };
  return {fetcher, calls};
}

test('request times out and keeps the provider name', async () => {
  const fetcher = (url, {signal}) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
  await assert.rejects(request('https://slow.example/x', {fetcher, timeout: 20}), e => e.name === 'TimeoutError' && e.provider === 'slow.example');
});

test('request honours an external abort', async () => {
  const controller = new AbortController();
  const fetcher = (url, {signal}) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
  const pending = request('https://a.example/', {fetcher, signal: controller.signal});
  controller.abort(new DOMException('stop', 'AbortError'));
  await assert.rejects(pending, e => e.name === 'AbortError');
});

test('publicIP falls back and enforces the address family', async () => {
  const {fetcher, calls} = router([[/ipv4\.icanhazip/, () => text('2001:db8::1\n')], [/api\.ipify/, () => json({ip: '203.0.113.4'})]]);
  assert.deepEqual(await publicIP(4, {fetcher}), {ip: '203.0.113.4', source: 'api.ipify.org'});
  assert.equal(calls.length, 2);
  await assert.rejects(publicIP(6, {fetcher: router([]).fetcher}), e => e.code === 'NO_IPV6');
});

test('claudeTrace measures latency and only allows Claude domains', async () => {
  let t = 100;
  const {fetcher} = router([[/claude\.ai\/cdn-cgi\/trace/, () => { t += 42; return text('ip=203.0.113.4\nloc=SG\ncolo=SIN'); }]]);
  assert.deepEqual(await claudeTrace('claude.ai', {fetcher, now: () => t}), {ip: '203.0.113.4', loc: 'SG', colo: 'SIN', http: null, warp: null, ms: 42});
  await assert.rejects(claudeTrace('example.com', {fetcher}));
});

test('geoIP uses the first provider that answers for the exact IP', async () => {
  const {fetcher, calls} = router([
    [/ipinfo\.io/, () => json({ip: '9.9.9.9', country: 'US'})],
    [/ipwho\.is/, () => json({success: true, ip: '203.0.113.4', country_code: 'SG', city: 'Singapore', connection: {asn: 64500, isp: 'Example Hosting'}, timezone: {id: 'Asia/Singapore'}})]
  ]);
  const g = await geoIP('203.0.113.4', {fetcher});
  assert.equal(g.cc, 'SG');
  assert.equal(g.asn, 64500);
  assert.equal(g.timezone, 'Asia/Singapore');
  assert.equal(g.source, 'ipwho.is');
  assert.equal(calls.length, 2, 'mismatched ipinfo answer is skipped');
  const r = router([[/ipinfo\.io/, () => json({ip: '1.1.1.1', country: 'AU', org: 'AS13335 Cloudflare, Inc.', timezone: 'Australia/Sydney'})]]);
  assert.deepEqual({...(await geoIP('1.1.1.1', {fetcher: r.fetcher})), country: undefined}, {cc: 'AU', city: undefined, asn: 13335, org: 'Cloudflare, Inc.', timezone: 'Australia/Sydney', country: undefined, source: 'ipinfo.io'});
});

test('geoCache dedupes and enforces its budget', async () => {
  const {fetcher, calls} = router([[/ipinfo\.io/, url => json({country: 'SG', ip: url.split('/')[3]})]]);
  const geo = geoCache({fetcher, limit: 2});
  await Promise.all([geo('1.1.1.1'), geo('1.1.1.1'), geo('2.2.2.2')]);
  assert.equal(calls.length, 2);
  await assert.rejects(geo('3.3.3.3'), /预算/);
});

test('ipRisk reads ipquery flags and rejects mismatched answers', async () => {
  const ok = router([[/ipquery/, () => json({ip: '1.2.3.4', risk: {is_datacenter: true, is_vpn: false, is_proxy: false, is_tor: false, is_mobile: false, risk_score: 20}})]]);
  assert.deepEqual(await ipRisk('1.2.3.4', {fetcher: ok.fetcher}), {datacenter: true, vpn: false, proxy: false, tor: false, mobile: false, score: 20, source: 'ipquery.io'});
  const bad = router([[/ipquery/, () => json({ip: '9.9.9.9', risk: {}})]]);
  await assert.rejects(ipRisk('1.2.3.4', {fetcher: bad.fetcher}));
});

test('dnsLeak merges resolvers from all four services', async () => {
  const {fetcher, calls} = router([
    [/surfsharkdns/, () => json({'172.253.1.1': {IP: '172.253.1.1', ISP: 'Google', Country: 'Singapore', City: 'Singapore', CountryCode: 'SG'}})],
    [/fastly-analytics/, () => json({dns_resolver_info: {ip: '114.114.114.114', cc: 'CN', as_name: 'CHINANET-BACKBONE - No.31,Jin-rong Street, CN'}})],
    [/dns4\.browserleaks/, () => json({'172.253.1.1': ['SG', 'Singapore, Singapore', 'Google LLC']})],
    [/dns6\.browserleaks/, () => Promise.reject(new TypeError('no v6'))]
  ]);
  const updates = [];
  const r = await dnsLeak({fetcher, onUpdate: u => updates.push(u.resolvers.length)});
  assert.equal(calls.length, 16);
  assert.equal(new Set(calls).size, 16, 'every lookup uses a fresh random hostname');
  assert.equal(r.total, 16);
  assert.equal(r.ok, 13);
  assert.equal(r.resolvers.length, 2);
  const google = r.resolvers.find(x => x.ip === '172.253.1.1');
  assert.equal(google.location, 'Singapore, Singapore', 'surfshark detail wins');
  assert.deepEqual(google.sources.sort(), ['browserleaks', 'surfshark']);
  const cn = r.resolvers.find(x => x.cc === 'CN');
  assert.equal(cn.isp, 'No.31,Jin-rong Street');
  assert.ok(updates.length >= 1);
});

class FakePeer {
  constructor(config) { FakePeer.last = this; this.config = config; this.closed = false; }
  createDataChannel() {}
  async createOffer() { return {}; }
  async setLocalDescription() {
    queueMicrotask(() => {
      this.onicecandidate?.({candidate: {candidate: 'candidate:1 1 udp 1 203.0.113.7 5000 typ srflx raddr 10.0.0.2 rport 5000'}});
      this.onicecandidate?.({candidate: {candidate: 'candidate:1 1 udp 1 203.0.113.7 5000 typ srflx raddr 10.0.0.2 rport 5000'}});
      this.onicecandidate?.({candidate: null});
    });
  }
  close() { this.closed = true; }
}

test('webRTC gathers deduplicated candidates through several STUN servers and closes', async () => {
  const r = await webRTC({Peer: FakePeer});
  assert.deepEqual(r.candidates.map(c => c.address), ['203.0.113.7', '10.0.0.2']);
  assert.ok(FakePeer.last.closed);
  assert.ok(FakePeer.last.config.iceServers.length >= 4);
  assert.ok(FakePeer.last.config.iceServers.some(s => /bilibili|miwifi/.test(s.urls)), 'includes mainland STUN servers');
  await assert.rejects(webRTC({Peer: undefined}), e => e.code === 'NO_RTC');
});
