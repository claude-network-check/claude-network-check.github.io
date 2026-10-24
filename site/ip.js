// IP literal handling shared by every probe. Never accept hostnames or integer-as-IP forms.

export function normalizeIP(value) {
  if (typeof value !== 'string') return null;
  const s = value.trim().toLowerCase().replace(/^\[|\]$/g, '');
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

export const family = ip => (ip.includes(':') ? 6 : 4);

/** public | local | mdns | invalid. CGNAT and link-local count as local. */
export function addressKind(value) {
  if (typeof value === 'string' && value.toLowerCase().endsWith('.local')) return 'mdns';
  const ip = normalizeIP(value);
  if (!ip) return 'invalid';
  if (family(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224) return 'local';
  } else if (ip === '::' || ip === '::1' || /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip) || ip.startsWith('ff')) return 'local';
  return 'public';
}

/** Cloudflare /cdn-cgi/trace: ip, loc (Cloudflare's own country for the IP), colo, warp. */
export function parseTrace(text) {
  const fields = Object.fromEntries(String(text).split(/\r?\n/).map(l => l.split('=')).filter(p => p.length >= 2).map(([k, ...v]) => [k, v.join('=')]));
  const ip = normalizeIP(fields.ip);
  if (!ip) throw new Error('trace 响应中没有有效 IP');
  return {ip, loc: /^[A-Z]{2}$/.test(fields.loc || '') ? fields.loc : null, colo: fields.colo || null, http: fields.http || null, warp: fields.warp || null};
}

/** Extract every address an ICE candidate line carries (connection address and raddr). */
export function candidateAddresses(line) {
  const fields = String(line || '').trim().split(/\s+/);
  const type = fields[fields.indexOf('typ') + 1] || 'unknown';
  const out = [];
  const add = raw => {
    if (!raw || raw === '0.0.0.0' || raw === '::') return;
    const kind = addressKind(raw);
    if (kind === 'invalid') return;
    out.push({address: normalizeIP(raw) || raw.toLowerCase(), kind, type});
  };
  add(fields[4]);
  const r = fields.indexOf('raddr');
  if (r > 0) add(fields[r + 1]);
  return out;
}

let regionNames;
export function countryName(code) {
  if (!code) return '';
  try { regionNames ??= new Intl.DisplayNames(['zh-CN'], {type: 'region'}); return regionNames.of(code) || code; }
  catch { return code; }
}

/** Mask for screenshots: keep the network prefix, hide the host part. */
export function maskIP(ip) {
  if (!ip) return ip;
  if (family(ip) === 4) return ip.split('.').slice(0, 2).join('.') + '.*.*';
  return ip.split(':').slice(0, 2).join(':') + ':****';
}

export function redactText(text) {
  return String(text)
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?:\/\d+)?\b/g, '[IP]')
    .replace(/\b[a-z\d-]+\.local\b/gi, '[mDNS]')
    .replace(/(?<![\w:])(?:[\da-f]{1,4}:){2,}[\da-f:.]*(?:\/\d+)?/gi, '[IPv6]');
}
