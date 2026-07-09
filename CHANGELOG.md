# n0va — Changelog

Backend: `backend/server.js` (port 3001)
Frontend: `frontend/` (port 3000)
DB: `backend/registry/tools.db`

## 2026-07-07 — Container Isolation + Infrastructure

### Added
- `scripts/start-backend.sh` — reliable startup with PID file tracking, uses setsid to survive shell disconnection
- `scripts/restart-backend.sh` — kills existing backend and restarts
- `CHANGELOG.md` — this file, tracks all changes and current state

### Changed
- `backend/lib/container.js` — new module: `sandbox(cmd, opts)` wraps commands in `unshare -U [-n]` user+network namespace isolation
- `backend/adapters/base.js` — added `runSandboxed(toolName, cmd, opts)` + `checkSandbox()`. When `CONTAINERIZED=true`, tool scan commands auto-wrap in isolated namespaces
- `backend/adapters/gitleaks.js` — scan command uses `runSandboxed` (no network)
- `backend/adapters/trufflehog.js` — scan command uses `runSandboxed` (no network)
- `backend/adapters/semgrep.js` — scan command uses `runSandboxed` (no network)
- `backend/adapters/nuclei.js` — scan command uses `runSandboxed` (shared network)
- `backend/adapters/nmap.js` — scan command uses `runSandboxed` (shared network)
- `backend/adapters/nikto.js` — scan command uses `runSandboxed` (shared network)
- `backend/adapters/msfconsole.js` — scan command uses `runSandboxed` (shared network)
- `backend/lib/orchestrator.js` — passes `containerized` config to all adapters
- `backend/server.js` — passes `containerized: process.env.CONTAINERIZED === 'true'`

### Infrastructure
- Installed `uidmap` package for unprivileged user namespaces (needed by bwrap/unshare)
- Created `scripts/start-backend.sh` — reliable backend startup with `setsid` + PID file
- Created `CHANGELOG.md` — this file

### How to run with isolation
```bash
CONTAINERIZED=true bash scripts/start-backend.sh
```

### Isolation levels
| Tools | Network | User | Risk |
|-------|---------|------|------|
| gitleaks, trufflehog, semgrep | Isolated | nobody | Cannot exfiltrate data |
| nuclei, nmap, nikto, msfconsole | Shared | nobody | Can reach network targets |

## 2026-07-06 — Phase 1 Step 4: Async spawn + nikto + msfconsole

### Fixed
- `backend/adapters/base.js` — `runAsync` uses async `spawn()` with SIGTERM timeout instead of `execSync`. Event loop no longer blocks
- `backend/adapters/git-clone.js` — git clone now checks `exitCode` instead of using `execSync`

### Added
- `backend/adapters/nikto.js` — NiktoAdapter: scans web targets with nikto, parses JSON output
- `backend/adapters/msfconsole.js` — MsfconsoleAdapter: runs Metasploit auxiliary scanners via resource scripts
- `backend/lib/orchestrator.js` — registered both new adapters
- `backend/pipelines/web-audit.yaml` — new pipeline: nuclei + nikto + report
- Nikto installed at `~/.local/bin/nikto` via Perl script with PERL5LIB wrapper

### Status
- nikto: installed, tested (13 findings against local HTTP server)
- msfconsole: adapter written, tool not installed (~1.5GB, needs PostgreSQL)

## 2026-07-05 — Baseline Diffing + SARIF

### Added
- `backend/lib/baseline.js` — BaselineDiff class. SHA256 fingerprints findings by `file+line+message+cwe`. Compares against latest completed scan for same `repoUrl`. Marks `isNew: true/false` on each finding
- `backend/lib/sarif.js` — `toSarif(findings, execution)` converts normalized findings → SARIF 2.1 JSON. Rules deduplicated by tool/CWE. Results with file URI + line + level + isNew flag
- `backend/registry/db.js` — `getLatestExecutionForRepo(repoUrl)` query
- `backend/server.js` — `GET /api/executions/:id/sarif` endpoint
- `backend/adapters/report-merger.js` — BaselineDiff injection, `newFindings`/`knownFindings` in summary
- `frontend/src/components/Executor.jsx` — BaselineBadge (NEW/KNOWN), "new only" filter, SARIF download button
- `frontend/src/components/History.jsx` — New/known breakdown per step + SARIF download link

## 2026-07-04 — Phase 1 Step 1-3: Standardization + Tool Checks

### Added
- `backend/adapters/standard.js` — normalized finding schema `{file, line, message, severity, cwe, tool, raw}`
- `backend/adapters/base.js` — `normalizeFindings()`, `mapSeverity()`, `extractCWE()` added. `toolInfo` map with install URLs for 5 tools (gitleaks, trufflehog, semgrep, nuclei, nmap). `ensureTool()` / `checkTool()` methods
- `backend/adapters/report-merger.js` — simplified to single-path

### Changed
- All adapters refactored to use BaseAdapter methods, normalized findings, and centralized tool checks

## 2026-07-01 — Initial: n0va Orchestrator

### Added
- Backend: Express server, SQLite registry, gitleaks/trufflehog/semgrep adapters
- Frontend: React + Vite dashboard with Landing, Executor, History, ToolGrid, AddTool, Analyze tabs
- Pipelines: full-scan, quick-scan, sast-only, web-audit YAML files
- PipelineEngine with parallel step execution and dependency resolution
- 9router integration at port 20128
- AI-driven scan planning (deprecated; replaced by YAML pipelines)
