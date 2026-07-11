<p align="center">
  <img src="./n0va.png" alt="n0va" width="320" />
</p>

# n0va — Security Orchestrator

A local-first security orchestrator that turns any target (GitHub repo, web app,
IP/host, or npm package) into a runnable scan pipeline. Paste a target → it
classifies it and discovers which scanners apply → pick a YAML pipeline → tools
run in parallel with sandbox isolation → you get normalized, deduplicated
findings with PoC commands you can run yourself.

No AI required. No cloud. Your data stays on your machine.

## Why

Most scanner dashboards either (a) shell out to one tool, or (b) use an LLM to
"plan" execution — slow, non-deterministic, and needs an API key. n0va uses
**declarative YAML pipelines** instead: deterministic, replayable, and reviewable.
AI is optional and only used *after* scanning, for triage / fix suggestions.

## Features

- **Target intelligence** — classifies repos vs. web apps vs. hosts; fingerprints
  tech, WAF, and open ports with evidence-weighted confidence
- **Declarative pipelines** — `backend/pipelines/*.yaml` describe steps;
  `PipelineEngine` runs them in parallel with RAM-weighted concurrency
- **Parallel scanners** — gitleaks, trufflehog, semgrep, nuclei, nmap, nikto,
  msfconsole, plus recon (whatweb, wafw00f, gobuster)
- **Cross-tool dedupe** — findings merged on a fingerprint (file | line-bucket |
  secret-keyword-or-CWE), keeping the highest severity
- **Baseline diffing** — only report *new* findings vs. the last scan
- **Sandbox isolation** — Linux user namespaces (`unshare` + `setpriv`, dropped
  caps) by default; optional Docker mode
- **Operator safety** — passive-by-default recon, explicit risk badges/warnings
  for active/aggressive tools, egress proxy awareness, secret redaction before
  any output is persisted or streamed
- **Tamper-evident audit log** + **AES-256-GCM encrypted** result blobs at rest
- **PoC surfacing** — per-finding Kali-style commands (and tool-availability
  checks) so you can verify/exploit findings yourself
- **SARIF output** for CI integration

## Architecture

```
                 ┌─────────────────────────────┐
                 │  Dashboard (React + Vite)    │  :3000
                 │  Landing / Analyze / Scan /  │
                 │  History / Store             │
                 └──────────────┬──────────────┘
                                │ HTTP + WebSocket
                 ┌──────────────▼──────────────┐
                 │  Backend (Express)           │  :3001
                 │  server.js / PipelineEngine  │
                 │  TargetAnalyzer / Orchestrator│
                 │  Adapters / report-merger    │
                 └──────────────┬──────────────┘
                                │ spawns (sandboxed)
                 ┌──────────────▼──────────────┐
                 │  Scanners (host-installed)   │
                 │  gitleaks trufflehog semgrep │
                 │  nuclei nmap nikto msfconsole│
                 └───────────────────────────────┘
```

State lives under `~/.tool-orchestrator/` (repos, streams, backups, config) —
**never** in the repo.

## Prerequisites

- Node.js 18+
- Scanner CLIs you intend to use, e.g.:
  - `apt install gitleaks trufflehog semgrep nuclei nmap nikto whatweb wafw00f gobuster`
  - Metasploit / mysql / redis / psql clients are optional (PoC cards flag
    missing tools)

## Install

```bash
npm install -g n0va      # installs the CLI globally
# or run without installing:
npx n0va
```

Scanner CLIs you intend to use must be on your PATH, e.g.:

```bash
apt install gitleaks trufflehog semgrep nuclei nmap nikto whatweb wafw00f gobuster
```

Metasploit / mysql / redis / psql clients are optional (PoC cards flag
missing tools).

## Run

```bash
n0va            # starts the orchestrator, opens the dashboard
```

Then open **http://localhost:3001** in your browser. That's it — one
command, no build step, no separate frontend process.

## Configuration

All paths resolve to `~/.tool-orchestrator/...` by default. Override with env:

| Var | Purpose |
|-----|---------|
| `TOOL_REPOS_DIR` | where cloned repos live |
| `TOOL_BIN_DIR` | extra scanner binaries (e.g. `~/.local/bin`) |
| `CONTAINERIZED=docker` | use Docker isolation instead of `unshare` |
| `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY` | egress proxy (operator safety) |
| `PORT` | backend port (default 3001) |

> **Operator safety**: active/aggressive scanners expose your real IP to the
> target. Route through a VPN or proxy before running them. n0va surfaces a
> warning in the UI but does **not** block you — scanning targets you don't
> own without authorization may be illegal. You are responsible for compliance.

## API (subset)

- `GET  /api/tools` — registered tools
- `POST /api/analyze` — classify a target + optional recon/nuclei
- `POST /api/pipelines/:id/execute` — run a pipeline
- `POST /api/console/run` — run a (sandboxed, redacted, audited) shell command
- `GET  /api/audit` — tamper-evident audit log

## Development (from source)

```bash
git clone https://github.com/techf-afk/n0va.git
cd n0va
npm install                 # backend deps
cd frontend && npm install && npm run build && cd ..
node bin/n0va.js           # serves API + built UI on :3001
```

Run the backend test suite:

```bash
npm test                   # node --test (no framework needed)
```

Use a `--verbose` flag (or `N0VA_VERBOSE=1`) for debug-level logs.

## Contributing

PRs welcome. Keep the local-first, no-AI-required principle. Add scanners as
`BaseAdapter` subclasses; add pipelines as YAML.

## License

MIT — see [LICENSE](./LICENSE).
