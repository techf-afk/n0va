# Contributing to n0va

Thanks for wanting to improve n0va. It's a local-first security orchestrator —
the core principle is **no AI required, no cloud, your data stays on your
machine**. Keep that invariant when you change things.

## Getting started

```bash
npm run install:all
npm run dev          # backend :3001 + frontend :3000
```

Scanners are host-installed. Install what you need:

```bash
apt install gitleaks trufflehog semgrep nuclei nmap nikto whatweb wafw00f gobuster
```

## How the pieces fit

- **Pipelines** are declarative YAML in `backend/pipelines/*.yaml`. Add a new
  one to expose a new scan flow — no backend code required.
- **Scanners** are `BaseAdapter` subclasses in `backend/adapters/`. Implement
  `ensureTool`, `runAsync`/`runSandboxed`, and `normalizeFindings`. Emit
  findings in the standard schema:
  `{ file, line, message, severity, cwe, tool, raw }`.
- **Target intelligence** lives in `backend/lib/target-analyzer.js` (evidence-
  weighted confidence) and `backend/lib/scanner.js` (tool registry + risk
  levels).
- **Dedupe & merge** in `backend/adapters/report-merger.js`. Fingerprint =
  file | line-bucket | secret-keyword-or-CWE.
- **Frontend** is React + Vite in `frontend/`. Components live in
  `frontend/src/components/`.

## Rules

1. **Don't break local-first.** No phoning home, no required API keys, no
   cloud dependencies in the default path.
2. **Sandbox by default.** New scanner commands must run through
   `BaseAdapter.runSandboxed` (unshare/setpriv) or document why not.
3. **Redact secrets.** Anything user-supplied that looks like a secret must
   pass through `backend/lib/redact.js` before streaming or persisting.
4. **Operator safety.** Active/aggressive tools need a `risk` level in
   `KNOWN_TOOLS` and a UI warning. Never hide risk from the operator.
5. **No committed data.** `*.db`, `backend/backups/`, `.opencode/`, `.env`,
   and `~/.tool-orchestrator/` are gitignored. Don't force-add them.
6. **Tests** for new adapter/merge logic are welcome; keep them in-repo and
   offline (no network in CI by default).

## PR checklist

- [ ] `npm run build` (or `cd frontend && npm run build`) succeeds
- [ ] New env vars are documented in README's config table
- [ ] New adapters register a `risk` level and surface a warning if active/aggressive
- [ ] No secrets, paths, or personal data in the diff

Open the PR against `master`. Keep changes focused; large refactors are easier
to review in smaller chunks.
