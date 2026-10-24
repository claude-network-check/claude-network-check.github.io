// Browser-local signals. Nothing here makes a network request.
// The six "China user" signals use the same weights and partial scores as IPPure's Claude page
// (https://ippure.com/claude, read 2026-10-24) so the two tools give comparable numbers.

export const chinaZones = ['Asia/Shanghai', 'Asia/Urumqi', 'Asia/Chongqing', 'Asia/Chungking', 'Asia/Harbin', 'Asia/Kashgar', 'PRC'];
const sarZones = ['Asia/Hong_Kong', 'Asia/Macau', 'Asia/Taipei'];
export const scFonts = ['Microsoft YaHei', 'Microsoft YaHei UI', 'SimSun', 'NSimSun', 'SimHei', 'KaiTi', 'FangSong', 'DengXian', 'PingFang SC', 'Hiragino Sans GB', 'STHeiti', 'STSong', 'Songti SC', 'Source Han Sans CN', 'Source Han Sans SC', 'Noto Sans CJK SC', 'Noto Serif CJK SC', 'WenQuanYi Micro Hei', 'WenQuanYi Zen Hei', 'HarmonyOS Sans SC', 'Alibaba PuHuiTi'];
export const tcFonts = ['Microsoft JhengHei', 'PMingLiU', 'MingLiU', 'DFKai-SB', 'PingFang TC', 'PingFang HK', 'Source Han Sans TW', 'Noto Sans CJK TC'];
// Fonts that ship with the OS regardless of region; a hit made only of these is common outside China.
const osBundled = new Set(['PingFang SC', 'PingFang TC', 'PingFang HK', 'Hiragino Sans GB', 'STHeiti', 'STSong', 'Songti SC', 'Microsoft YaHei', 'Microsoft YaHei UI', 'SimSun', 'NSimSun', 'SimHei', 'DengXian', 'KaiTi', 'FangSong', 'Microsoft JhengHei', 'PMingLiU', 'MingLiU']);

const simplified = l => l.startsWith('zh-cn') || l.includes('hans') || l === 'zh';
const traditional = l => l.startsWith('zh-tw') || l.startsWith('zh-hk') || l.startsWith('zh-mo') || l.includes('hant');

export function scoreTimezone(tz) { return chinaZones.includes(tz) ? 1 : sarZones.includes(tz) ? 0.6 : 0; }
export function scoreLanguages(list) {
  const langs = (list || []).map(l => String(l).toLowerCase());
  const first = langs[0] || '';
  if (simplified(first)) return 1;
  if (traditional(first)) return 0.5;
  if (langs.some(simplified)) return 0.7;
  return langs.some(l => l.startsWith('zh')) ? 0.4 : 0;
}
export function scoreFonts({sc = [], tc = []}) { return sc.length ? Math.min(1, 0.75 + 0.08 * sc.length) : tc.length ? 0.5 : 0; }
export function scoreLocale(locale) { const l = String(locale || '').toLowerCase(); return simplified(l) ? 1 : l.startsWith('zh') ? 0.5 : 0; }
export function scoreOffset(minutesEast) { return minutesEast === 480 ? 0.7 : 0; }
export const vendorScores = {Apple: 0.25, Microsoft: 0.4, Google: 0.35, Linux: 0.5, Unknown: 0.4};
export function osVendor(ua = '', platform = '') {
  const s = `${platform} ${ua}`.toLowerCase();
  if (/iphone|ipad|ipod|mac/.test(s)) return 'Apple';
  if (/android|cros/.test(s)) return 'Google';
  if (/win/.test(s)) return 'Microsoft';
  if (/linux/.test(s)) return 'Linux';
  return 'Unknown';
}

export const signalSpec = [
  {id: 'timezone', name: '系统时区', weight: 30, claude: true, desc: 'Intl 读到的 IANA 时区。Claude Code 读取的正是同一个系统时区，Asia/Shanghai、Asia/Urumqi 等记满分。'},
  {id: 'languages', name: '浏览器语言', weight: 24, desc: 'navigator.languages。首选简体中文满分，列表中含中文也部分计分。'},
  {id: 'fonts', name: '中文字体', weight: 20, desc: 'Canvas 字宽探测简繁中文字体。macOS、Windows 自带部分中文字体，因此这一项很常见。'},
  {id: 'locale', name: 'Intl 区域设置', weight: 10, desc: '浏览器用于日期、数字格式化的 locale。'},
  {id: 'offset', name: 'UTC 偏移', weight: 8, desc: 'getTimezoneOffset() 是否为 UTC+8。新加坡、台北、马尼拉等也是 UTC+8，所以只计部分分。'},
  {id: 'emoji', name: 'Emoji / 系统风格', weight: 8, desc: '由 UA 推断操作系统厂商，弱相关信号，任何系统都会得到少量分数。'}
];

/** Weighted 0–100 score; a signal scoring ≥ 0.25 counts as a hit. Bands: 0–30 low, 31–60 medium, 61–100 high. */
export function chinaScore(raw) {
  const scores = {
    timezone: scoreTimezone(raw.timezone),
    languages: scoreLanguages(raw.languages),
    fonts: scoreFonts(raw.fonts || {}),
    locale: scoreLocale(raw.locale),
    offset: scoreOffset(raw.offset),
    emoji: vendorScores[raw.vendor] ?? vendorScores.Unknown
  };
  const display = {
    timezone: raw.timezone || '不可读取',
    languages: (raw.languages || []).join(', ') || '不可读取',
    fonts: fontLabel(raw.fonts || {}),
    locale: raw.locale || '不可读取',
    offset: offsetLabel(raw.offset),
    emoji: `${raw.vendor || 'Unknown'} 风格`
  };
  const signals = signalSpec.map(s => ({...s, score: scores[s.id], points: s.weight * scores[s.id], value: display[s.id], hit: scores[s.id] >= 0.25}));
  const total = Math.round(signals.reduce((n, s) => n + s.points, 0));
  return {total, band: total <= 30 ? 'low' : total <= 60 ? 'medium' : 'high', signals};
}

function fontLabel({sc = [], tc = []}) {
  const all = [...sc, ...tc];
  if (!all.length) return '未探测到';
  const bundledOnly = all.every(f => osBundled.has(f));
  return `${all.slice(0, 3).join('、')}${all.length > 3 ? ` 等 ${all.length} 种` : ''}${bundledOnly ? '（均为系统自带）' : ''}`;
}

export function offsetLabel(minutes) {
  if (!Number.isFinite(minutes)) return '不可读取';
  const n = Math.abs(minutes), h = Math.floor(n / 60), m = n % 60;
  return `UTC${minutes >= 0 ? '+' : '−'}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}

/** Offset in minutes east of UTC that an IANA zone has at the given instant. */
export function zoneOffset(timezone, date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'}).formatToParts(date).filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
  return Math.round((Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

function detectFonts(doc) {
  const ctx = doc.createElement('canvas').getContext('2d');
  if (!ctx) return {sc: [], tc: [], error: true};
  const sample = '中文字体检测ABCabc012';
  const differs = font => ['monospace', 'sans-serif', 'serif'].some(base => {
    ctx.font = `72px ${base}`; const before = ctx.measureText(sample).width;
    ctx.font = `72px "${font}", ${base}`; return Math.abs(ctx.measureText(sample).width - before) > 0.5;
  });
  return {sc: scFonts.filter(differs), tc: tcFonts.filter(differs)};
}

function browserName(ua, brands = []) {
  const b = brands.find(x => !/not.?a.?brand|chromium/i.test(x.brand));
  if (b) return `${b.brand} ${b.version}`;
  const m = ua.match(/(Edg|OPR|Firefox|Chrome|Version)\/([\d.]+)/);
  if (!m) return '未知';
  const name = {Edg: 'Edge', OPR: 'Opera', Version: /Safari/.test(ua) ? 'Safari' : 'Browser'}[m[1]] || m[1];
  return `${name} ${m[2].split('.')[0]}`;
}
function osName(ua, platform) {
  if (/Windows NT/.test(ua)) return 'Windows';
  if (/iPhone|iPad/.test(ua)) return 'iOS / iPadOS';
  if (/Mac OS X|Macintosh/.test(ua)) return 'macOS';
  if (/Android/.test(ua)) return 'Android';
  if (/CrOS/.test(ua)) return 'ChromeOS';
  if (/Linux/.test(ua)) return 'Linux';
  return platform || '未知';
}

function webgl(doc) {
  const canvas = doc.createElement('canvas');
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  if (!gl) return null;
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  } finally { gl.getExtension('WEBGL_lose_context')?.loseContext(); }
}

const attempt = (fn, fallback) => { try { return fn(); } catch { return fallback; } };

export function collectLocal(win = window) {
  const nav = win.navigator, doc = win.document;
  const options = attempt(() => win.Intl.DateTimeFormat().resolvedOptions(), {});
  const raw = {
    timezone: options.timeZone || '',
    locale: options.locale || '',
    languages: attempt(() => [...(nav.languages?.length ? nav.languages : [nav.language])].filter(Boolean), []),
    offset: attempt(() => -new win.Date().getTimezoneOffset(), undefined),
    fonts: attempt(() => detectFonts(doc), {sc: [], tc: [], error: true}),
    vendor: osVendor(nav.userAgent, nav.platform)
  };
  const ua = nav.userAgent || '';
  const device = {
    os: osName(ua, nav.userAgentData?.platform || nav.platform),
    browser: browserName(ua, nav.userAgentData?.brands),
    renderer: attempt(() => webgl(doc), null),
    screen: attempt(() => `${win.screen.width} × ${win.screen.height} @${win.devicePixelRatio}x`, null),
    cores: nav.hardwareConcurrency || null,
    webdriver: nav.webdriver === true,
    cookies: nav.cookieEnabled !== false,
    rtcAPI: typeof win.RTCPeerConnection === 'function',
    tzOffsetConsistent: raw.timezone && Number.isFinite(raw.offset) ? attempt(() => zoneOffset(raw.timezone) === raw.offset, null) : null
  };
  return {raw, device, ...chinaScore(raw)};
}
