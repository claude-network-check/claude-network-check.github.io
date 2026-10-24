import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeIP, addressKind, parseTrace, candidateAddresses, maskIP, redactText} from '../site/ip.js';
import {isSupported} from '../site/regions.js';
import {chinaScore, scoreLanguages, scoreFonts, osVendor, offsetLabel, zoneOffset} from '../site/local.js';
import {exitRegion, exitConsistency, assessDNS, assessRTC, timezoneMatch, riskLabel, findings, verdict} from '../site/assess.js';

test('IP literals are normalised strictly', () => {
  assert.equal(normalizeIP(' 1.2.3.4\n'), '1.2.3.4');
  assert.equal(normalizeIP('01.2.3.4'), null);
  assert.equal(normalizeIP('256.1.1.1'), null);
  assert.equal(normalizeIP('example.com'), null);
  assert.equal(normalizeIP('2001:DB8::1'), '2001:db8::1');
  assert.equal(normalizeIP('[2001:db8::1]'), '2001:db8::1');
  assert.equal(normalizeIP('::ffff:1.2.3.4'), '1.2.3.4');
  assert.equal(addressKind('192.168.1.2'), 'local');
  assert.equal(addressKind('100.64.0.1'), 'local');
  assert.equal(addressKind('fe80::1'), 'local');
  assert.equal(addressKind('abc-123.local'), 'mdns');
  assert.equal(addressKind('8.8.8.8'), 'public');
});

test('Cloudflare trace yields ip, country and colo', () => {
  const t = parseTrace('fl=1\nip=203.0.113.9\nloc=SG\ncolo=SIN\nwarp=off\n');
  assert.deepEqual(t, {ip: '203.0.113.9', loc: 'SG', colo: 'SIN', http: null, warp: 'off'});
  assert.equal(parseTrace('ip=1.1.1.1\nloc=XX1').loc, null);
  assert.throws(() => parseTrace('loc=SG'));
});

test('ICE candidate lines expose connection and related addresses', () => {
  const srflx = candidateAddresses('candidate:1 1 udp 1686052607 203.0.113.5 50000 typ srflx raddr 192.168.1.4 rport 50000');
  assert.deepEqual(srflx.map(c => [c.address, c.kind, c.type]), [['203.0.113.5', 'public', 'srflx'], ['192.168.1.4', 'local', 'srflx']]);
  assert.deepEqual(candidateAddresses('candidate:2 1 udp 2122260223 4f1c-aa.local 5000 typ host').map(c => c.kind), ['mdns']);
  assert.deepEqual(candidateAddresses('candidate:3 1 udp 1 1.2.3.4 9 typ srflx raddr 0.0.0.0 rport 0').length, 1);
});

test('masking and redaction hide host parts', () => {
  assert.equal(maskIP('203.0.113.9'), '203.0.*.*');
  assert.equal(maskIP('2001:db8:1:2::9'), '2001:db8:****');
  assert.equal(redactText('a 1.2.3.4 b 2001:db8::1 c x-1.local'), 'a [IP] b [IPv6] c [mDNS]');
});

test('supported-region policy', () => {
  for (const cc of ['US', 'SG', 'JP', 'TW', 'GB', 'PR']) assert.equal(isSupported(cc), true, cc);
  for (const cc of ['CN', 'HK', 'MO', 'RU', 'IR', 'KP', 'BY']) assert.equal(isSupported(cc), false, cc);
  assert.equal(isSupported(null), null);
  assert.equal(isSupported('sg'), null);
});

test('China-user score matches IPPure for the same browser', () => {
  // Observed on ippure.com/claude 2026-10-24: Asia/Singapore, en-US, 4 SC fonts, UTC+8, Apple → 28 (fonts +20, offset +6, emoji +2).
  const r = chinaScore({timezone: 'Asia/Singapore', languages: ['en-US', 'en'], locale: 'en-US', offset: 480, fonts: {sc: ['PingFang SC', 'Hiragino Sans GB', 'STSong', 'Songti SC'], tc: []}, vendor: 'Apple'});
  assert.equal(r.total, 28);
  assert.equal(r.band, 'low');
  assert.deepEqual(r.signals.filter(s => s.hit).map(s => s.id), ['fonts', 'offset', 'emoji']);
  const cn = chinaScore({timezone: 'Asia/Shanghai', languages: ['zh-CN', 'en'], locale: 'zh-CN', offset: 480, fonts: {sc: ['Microsoft YaHei'], tc: []}, vendor: 'Microsoft'});
  assert.equal(cn.total, Math.round(30 + 24 + 20 * 0.83 + 10 + 8 * 0.7 + 8 * 0.4));
  assert.equal(cn.band, 'high');
  const clean = chinaScore({timezone: 'America/New_York', languages: ['en-US'], locale: 'en-US', offset: -240, fonts: {sc: [], tc: []}, vendor: 'Linux'});
  assert.equal(clean.total, 4);
});

test('signal partial scores', () => {
  assert.equal(scoreLanguages(['zh-TW']), 0.5);
  assert.equal(scoreLanguages(['en-US', 'zh-CN']), 0.7);
  assert.equal(scoreLanguages(['en-US', 'zh-TW']), 0.4);
  assert.equal(scoreLanguages(['zh-Hans-CN']), 1);
  assert.equal(scoreFonts({sc: [], tc: ['PMingLiU']}), 0.5);
  assert.equal(scoreFonts({sc: ['SimSun', 'SimHei'], tc: []}), 0.91);
  assert.equal(osVendor('Mozilla/5.0 (Windows NT 10.0)', 'Win32'), 'Microsoft');
  assert.equal(osVendor('Mozilla/5.0 (Linux; Android 14)', 'Linux armv8'), 'Google');
  assert.equal(offsetLabel(480), 'UTC+8');
  assert.equal(offsetLabel(-210), 'UTC−3:30');
  assert.equal(zoneOffset('Asia/Singapore', new Date('2026-01-15T00:00:00Z')), 480);
});

test('exit region prefers Cloudflare loc over the geo database', () => {
  assert.deepEqual(exitRegion({loc: 'HK'}, {cc: 'SG', source: 'ipinfo.io'}), {cc: 'HK', supported: false, source: 'Cloudflare'});
  assert.deepEqual(exitRegion(null, {cc: 'JP', source: 'ipinfo.io'}), {cc: 'JP', supported: true, source: 'ipinfo.io'});
});

test('exit consistency compares IPv4 exits only', () => {
  assert.equal(exitConsistency([{ip: '1.1.1.1'}, {ip: '1.1.1.1'}, {ip: '1.1.1.1'}]).state, 'ok');
  assert.equal(exitConsistency([{ip: '1.1.1.1'}, {ip: '2.2.2.2'}]).state, 'warn');
  assert.equal(exitConsistency([{ip: '1.1.1.1'}, {ip: '2001:db8::1'}]).state, 'unknown');
  assert.equal(exitConsistency([{ip: null}, {ip: '1.1.1.1'}]).state, 'unknown');
});

test('DNS: any CN resolver is a leak, none observed is never safe', () => {
  assert.equal(assessDNS({resolvers: [{ip: '1.1.1.1', cc: 'SG'}], ok: 3}).state, 'ok');
  const leak = assessDNS({resolvers: [{ip: '114.114.114.114', cc: 'CN'}, {ip: '8.8.8.8', cc: 'US'}], ok: 3});
  assert.equal(leak.state, 'risk');
  assert.equal(leak.leaked.length, 1);
  assert.equal(assessDNS({resolvers: [], ok: 0}).state, 'error');
});

test('WebRTC: CN candidate leaks, foreign mismatch needs review, matching exit is fine', () => {
  const geo = {'1.2.3.4': {cc: 'CN'}, '5.6.7.8': {cc: 'JP'}};
  const of = ip => geo[ip];
  const c = (address, kind = 'public') => ({address, kind, type: 'srflx'});
  assert.equal(assessRTC([c('1.2.3.4')], ['9.9.9.9'], of).state, 'risk');
  assert.equal(assessRTC([c('5.6.7.8')], ['9.9.9.9'], of).state, 'warn');
  assert.equal(assessRTC([c('9.9.9.9'), c('192.168.1.2', 'local')], ['9.9.9.9'], of).state, 'ok');
  const none = assessRTC([c('x.local', 'mdns')], ['9.9.9.9'], of);
  assert.equal(none.state, 'ok');
  assert.equal(none.items.length, 0);
  assert.equal(none.local, 1);
  assert.equal(assessRTC([c('2001:db8::5')], ['9.9.9.9'], of).items[0].differs, false, 'no same-family exit to compare');
});

test('timezone match uses zone, then current offset', () => {
  assert.deepEqual(timezoneMatch('Asia/Singapore', 'Asia/Singapore'), {state: 'ok', exact: true});
  assert.deepEqual(timezoneMatch('Asia/Taipei', 'Asia/Singapore'), {state: 'ok', exact: false});
  assert.equal(timezoneMatch('Asia/Shanghai', 'America/Los_Angeles').state, 'warn');
  assert.equal(timezoneMatch('Asia/Shanghai', null).state, 'unknown');
});

test('IP risk label', () => {
  assert.deepEqual(riskLabel({datacenter: true, vpn: false, proxy: false, tor: false, mobile: false}), {type: '机房 IP', flags: []});
  assert.deepEqual(riskLabel({datacenter: false, vpn: true, proxy: true, tor: false, mobile: false}), {type: '住宅 / ISP', flags: ['VPN', '代理']});
  assert.equal(riskLabel(null), null);
});

test('findings rank risks first and the verdict follows them', () => {
  const raw = {timezone: 'Asia/Shanghai', languages: ['en-US'], locale: 'en-US', offset: 480, fonts: {sc: [], tc: []}, vendor: 'Apple'};
  const env = {raw, ...chinaScore(raw)};
  const list = findings({
    region: {cc: 'HK', supported: false},
    dns: {state: 'risk', leaked: [{}]},
    consistency: {state: 'warn', distinct: ['1.1.1.1', '2.2.2.2']},
    risk: {datacenter: true, vpn: false, proxy: false, tor: false},
    env
  });
  assert.deepEqual(list.map(f => f.severity), ['risk', 'risk', 'risk', 'warn', 'warn', 'info']);
  assert.ok(list.every(f => f.href?.startsWith('./guide.html#')));
  assert.equal(verdict(list, true).level, 'risk');
  assert.equal(verdict([], false).level, 'running');
  assert.equal(verdict([], true).level, 'ok');
  assert.equal(verdict([{severity: 'info'}], true).level, 'ok');
  assert.equal(verdict([{severity: 'warn'}], true).level, 'warn');
});
