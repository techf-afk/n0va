// Egress proxy awareness. n0va does NOT anonymize traffic itself — it only
// routes through a proxy the OPERATOR supplies (VPN/Tor/HTTP proxy).
// Standard vars: HTTP_PROXY, HTTPS_PROXY, ALL_PROXY (lowercase or uppercase).

export function getProxy() {
  const env = process.env;
  return env.ALL_PROXY || env.all_proxy ||
    env.HTTPS_PROXY || env.https_proxy ||
    env.HTTP_PROXY || env.http_proxy || null;
}

export function proxyStatus() {
  const p = getProxy();
  return {
    configured: !!p,
    proxy: p,
    note: p
      ? `Scan traffic will route through your proxy (${p}).`
      : 'No proxy set — scans run from your REAL IP. Set HTTP_PROXY / ALL_PROXY to route through a VPN/proxy.',
  };
}
