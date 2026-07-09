# n0va Security Orchestrator — Architecture & Progress

## What We're Building

A platform that turns any URL (GitHub repo, web app, npm package) into a security
scan pipeline. You paste a link → it discovers what tools apply → you pick a
pipeline → it runs the tools in parallel → you see the findings.

## Current State

```
                    ┌─────────────────────┐
                    │   Dashboard (React)  │  port 3000
                    │  Landing/AddTool/    │
                    │  Analyze/Scan/History│
                    └────────┬────────────┘
                             │ HTTP + WebSocket
                    ┌────────▼────────────┐
                    │   Backend (Express)  │  port 3001
                    │  server.js           │
                    └────────┬────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
   ┌──────────┐   ┌──────────────┐   ┌──────────────┐
   │ Analyze  │   │  Pipeline    │   │  Adapters     │
   │ target-  │   │  Engine      │   │  (tools)      │
   │ analyzer │   │  YAML files  │   │               │
   └──────────┘   └──────────────┘   └──────────────┘
```

## File Structure & What Each Part Does

```
tool-orchestrator/
├── backend/
│   ├── server.js              ← Express API: routes for analyze, execute,
│   │                            pipelines, history, WebSocket
│   │
│   ├── lib/
│   │   ├── orchestrator.js    ← Core: resolves pipelines, tracks execution
│   │   │                        in DB, broadcasts WebSocket events
│   │   ├── target-analyzer.js ← Classifies URLs (git-repo, web-app, npm),
│   │   │                        discovers tech stack, open ports, WAF,
│   │   │                        lockfiles + recommended tools
│   │   ├── tool-searcher.js   ← Searches 6+ sources for similar tools
│   │   ├── scanner.js         ← AI-driven scan (old, being replaced)
│   │   ├── ai-client.js       ← 9router LLM client (fallback only now)
│   │   │
│   │   └── tool-sources/      ← Each source is a file:
│   │       ├── github-rest.js   GitHub API search
│   │       ├── npm.js           npm registry search
│   │       ├── pypi.js          Python packages
│   │       ├── rubygems.js      Ruby gems
│   │       ├── packagist.js     PHP packages
│   │       ├── nuget.js         .NET packages
│   │       ├── crates.js        Rust crates
│   │       ├── maven.js         Java/Maven
│   │       ├── goproxy.js       Go modules
│   │       ├── awesome-local.js Awesome-* lists on GitHub
│   │       ├── topics-github.js GitHub topic search
│   │       ├── exploitdb.js     Exploit-DB lookup
│   │       ├── kali-tools.js    Kali tool list
│   │       ├── registry.js      Local DB lookup
│   │       ├── cache.js         Cached results
│   │       └── Source.js        Base class
│   │
│   ├── pipelines/
│   │   ├── PipelineEngine.js  ← Loads YAML, resolves dependencies,
│   │   │                        runs steps (parallel or sequential)
│   │   ├── full-scan.yaml     ← clone → gitleaks + trufflehog + semgrep
│   │   ├── quick-scan.yaml    ← clone → gitleaks + trufflehog
│   │   ├── sast-only.yaml     ← clone → semgrep
│   │   └── web-audit.yaml     ← [NEW] nuclei vuln scan (live URL)
│   │
│   ├── adapters/              ← Each wraps a CLI tool
│   │   ├── base.js            ← run(), broadcast(), canHandle()
│   │   ├── git-clone.js       ← git clone --depth 1
│   │   ├── gitleaks.js        ← gitleaks detect (secrets in code)
│   │   ├── trufflehog.js      ← trufflehog filesystem (secrets in git history)
│   │   ├── semgrep.js         ← semgrep --config auto (static analysis)
│   │   ├── nmap.js            ← nmap -sV (port scan)
│   │   ├── nuclei.js          ← [NEW] nuclei (3000+ vuln templates)
│   │   └── report-merger.js   ← Merges all findings into one report
│   │
│   └── registry/
│       ├── db.js              ← SQLite: tools, executions, steps, cache
│       ├── schema.sql         ← Table definitions
│       └── tools.db           ← Database file
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx            ← Router: Landing / Dashboard views
│   │   ├── main.jsx           ← React entry point
│   │   ├── index.css          ← Tailwind + monospace design system
│   │   │
│   │   └── components/
│   │       ├── Landing.jsx    ← Terminal hero page
│   │       ├── Sidebar.jsx    ← Nav sidebar (#201d1d bg, JetBrains Mono)
│   │       ├── Analyze.jsx    ← URL analysis + tool discovery (FIXED)
│   │       ├── Executor.jsx   ← Scan tab with pipeline selector (UPDATED)
│   │       ├── History.jsx    ← Past executions (UPDATED: shows pipeline tag)
│   │       ├── Stats.jsx      ← Usage statistics
│   │       ├── ToolGrid.jsx   ← Browse registered tools
│   │       └── AddTool.jsx    ← Register new tools
│   │
│   ├── vite.config.js         ← Proxy /api → port 3001
│   └── package.json
│
└── AGENTS.md                  ← Project context for OpenCode

Installed tools: gitleaks (8.18), trufflehog (3.95), semgrep (1.168),
                 nuclei (3.11), httpx
```

## What We Achieved (Session)

| Task | Status |
|------|--------|
| Dashboard Analyze shows discovered tools | ✅ FIXED (data.unwrap) |
| Pipeline system wired into Scan tab | ✅ Done |
| Pipeline YAML files (4 pipelines) | ✅ Done |
| Pipeline name in History | ✅ Done |
| nuclei installed + adapter | ✅ Done |
| web-audit pipeline (nuclei) | ✅ Done |

## Key Recurring Problems

1. **Data nesting bug** — Backend sends `{ result: { ... } }` but frontend
   was using `setResult(data)` instead of `setResult(data.result)`. This made
   ALL fields (discoveredTools, type, details, etc.) invisible in the UI.
   Same class of bug shows up wherever backend wraps responses inconsistently.

2. **Backend restarts lose state** — Running via `nohup node server.js &`,
   but the shell kills background processes when a tool call finishes.
   Fix: use `(nohup ... &)` subshell to detach. Even then, the backend
   sometimes crashes silently or gets SIGTERM from overlap with other commands.

3. **Shell timeout kills long scans** — The bash tool has a 120s default
   timeout. Nuclei scans can take 45-90s on large targets. Pipeline execution
   includes cloning + multiple tools. Need `--max-time` on curl AND
   larger shell timeouts.

4. **Adapter output inconsistency** — gitleaks returns `findings[]`,
   semgrep returns `results[]`, and report-merger has to handle both.
   No uniform finding schema across adapters yet.

5. **No tool availability checking** — The pipeline YAML references
   adapters (gitleaks, trufflehog, etc.) but doesn't check if the CLI
   tool is actually installed. Nuclei adapter tries to run and fails
   silently if the binary isn't found.

## What's Next (Ordered)

1. **Heuristic tool detection** — Check `$PATH` for installed tools,
   auto-register them so pipelines only show available tools
2. **Uniform SARIF output** — Normalize all findings into one format
3. **Baseline diffing** — Compare against last scan, only report NEW
4. **CLI version** — `n0va scan <url> --pipeline full-scan` via Node CLI
5. **AI post-scan triage** — Optional: use LLM to explain/filter findings
