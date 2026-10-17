// Small network guards: IP allowlists (with CIDR) and "is this URL a public host" for
// server-side fetches of URLs we did not write ourselves (SSRF protection).
const net = require('net');
const dns = require('dns').promises;

const normIp = (ip) => String(ip || '').replace(/^::ffff:/i, '').trim();

// "1.2.3.4, 5.6.7.0/24, 2001:db8::/32" -> BlockList (null when the list is empty)
function ipList(spec) {
  const items = String(spec || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!items.length) return null;
  const list = new net.BlockList();
  for (const it of items) {
    const [addr, bits] = it.split('/');
    const type = net.isIPv6(addr) ? 'ipv6' : 'ipv4';
    if (!net.isIP(addr)) continue;
    if (bits !== undefined) list.addSubnet(addr, Number(bits), type);
    else list.addAddress(addr, type);
  }
  return list;
}
function ipAllowed(list, ip) {
  const a = normIp(ip);
  if (!net.isIP(a)) return false;
  return list.check(a, net.isIPv6(a) ? 'ipv6' : 'ipv4');
}

// private / loopback / link-local / CGNAT / metadata / unique-local ranges
const PRIVATE = ipList('0.0.0.0/8,10.0.0.0/8,100.64.0.0/10,127.0.0.0/8,169.254.0.0/16,172.16.0.0/12,192.0.0.0/24,'
  + '192.168.0.0/16,198.18.0.0/15,224.0.0.0/4,240.0.0.0/4,::1/128,::/128,fc00::/7,fe80::/10');

// Resolves the URL's host and returns true only for http(s) to public addresses.
async function isPublicUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return false; }
  if (!/^https?:$/.test(u.protocol)) return false;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  let addrs;
  try { addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }); } catch { return false; }
  return addrs.length > 0 && addrs.every((a) => !ipAllowed(PRIVATE, a.address));
}

// host equals one of `domains` or is a subdomain of one
function hostIn(raw, domains) {
  let h;
  try { h = new URL(raw).hostname.toLowerCase(); } catch { return false; }
  return domains.some((d) => h === d || h.endsWith('.' + d));
}

module.exports = { normIp, ipList, ipAllowed, isPublicUrl, hostIn };
