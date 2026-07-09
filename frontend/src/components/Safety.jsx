import { useEffect, useState } from 'react';

const RISK_STYLES = {
  passive: 'text-accent-green border-accent-green/30 bg-accent-green/10',
  active: 'text-accent-orange border-accent-orange/30 bg-accent-orange/10',
  aggressive: 'text-red-400 border-red-400/30 bg-red-400/10',
};

export function RiskBadge({ level }) {
  if (!level || level === 'passive') return null;
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded border font-mono uppercase ${RISK_STYLES[level] || RISK_STYLES.active}`}>
      {level === 'aggressive' ? '⚠ aggressive' : 'active'}
    </span>
  );
}

export function RiskWarning({ level }) {
  if (!level || level === 'passive') return null;
  const text = level === 'aggressive'
    ? 'Sends many requests visible in the target\'s logs/WAF and can expose your real IP. Run only on targets you control. Route through a VPN or proxy (set HTTP_PROXY / ALL_PROXY) to avoid attribution.'
    : 'Sends traffic to the target and may be logged. Use a VPN or proxy (set HTTP_PROXY / ALL_PROXY) to avoid exposing your IP.';
  return (
    <div className={`text-[11px] border rounded p-2 mt-1 ${RISK_STYLES[level]}`}>
      {text}
    </div>
  );
}

// Persistent reminder: n0va does not anonymize traffic.
export function EgressBanner() {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    fetch('/api/safety/egress').then(r => r.json()).then(setStatus).catch(() => {});
  }, []);
  if (!status) return null;
  return (
    <div className={`text-[11px] border rounded p-2 mb-3 ${status.configured ? 'text-accent-green border-accent-green/30 bg-accent-green/10' : 'text-accent-orange border-accent-orange/30 bg-accent-orange/10'}`}>
      {status.configured
        ? `🔒 Egress proxy active (${status.proxy}) — scan traffic is routed through it.`
        : '⚠ n0va does NOT anonymize your traffic. Scans run from your REAL IP unless you set HTTP_PROXY / ALL_PROXY (VPN/proxy/Tor). You are responsible for scan authorization.'}
    </div>
  );
}
