// Secret redaction — mask secret material before it reaches logs/DB/browser.
// Keeps the last 4 chars so findings stay identifiable without leaking the value.

const HIGH_ENTROPY = /[A-Za-z0-9_\-]{20,}/g;
const AWS_KEY = /(AKIA[0-9A-Z]{16})/g;
const QUOTED_SECRET = /(['"`])(AKIA[0-9A-Z]{16}|[A-Za-z0-9_\-]{24,})\1/g;

function maskValue(v) {
  if (!v || v.length < 8) return v;
  const keep = v.slice(-4);
  return `${'•'.repeat(Math.min(v.length - 4, 12))}${keep}`;
}

export function redactText(text) {
  if (!text || typeof text !== 'string') return text;
  let out = text;
  // quoted secrets -> mask inner value, keep quotes
  out = out.replace(QUOTED_SECRET, (_m, q, val) => `${q}${maskValue(val)}${q}`);
  // bare AWS keys
  out = out.replace(AWS_KEY, m => maskValue(m));
  // any other long high-entropy token (likely a secret)
  out = out.replace(HIGH_ENTROPY, m => maskValue(m));
  return out;
}

export function redactFinding(finding) {
  if (!finding) return finding;
  const out = { ...finding };
  if (out.message) out.message = redactText(out.message);
  if (out.raw && typeof out.raw === 'object') {
    out.raw = { ...out.raw };
    for (const k of ['secret', 'raw', 'Raw', 'match', 'DecodedPassword', 'password', 'token', 'apikey', 'api_key']) {
      if (typeof out.raw[k] === 'string') out.raw[k] = maskValue(out.raw[k]);
    }
  }
  return out;
}

export function redactFindings(findings) {
  if (!Array.isArray(findings)) return findings;
  return findings.map(redactFinding);
}
