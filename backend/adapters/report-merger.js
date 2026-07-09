import { BaseAdapter } from './base.js';
import { BaselineDiff } from '../lib/baseline.js';
import { createHash } from 'crypto';

// Cross-tool dedup: collapse the same finding reported by multiple scanners.
// Two findings are "the same" if they share a file + line-region + (CWE or secret category).
const SECRET_KEYWORDS = [
  'aws', 'gcp', 'google', 'github', 'gitlab', 'slack', 'stripe', 'twilio', 'sendgrid',
  'password', 'secret', 'token', 'api[_-]?key', 'private[_-]?key', 'credential',
  'access[_-]?key', 'auth', 'bearer', 'pem', 'ssh', 'database', 'db[_-]?url', 'connection[_-]?string',
];
const KW_RE = new RegExp(`(${SECRET_KEYWORDS.join('|')})`, 'i');

function categoryOf(f) {
  // Secret keyword is the strongest cross-tool signal — check it first,
  // even if a CWE is present (secret scanners rarely emit CWE, SAST tools do).
  const m = (f.message || '').match(KW_RE);
  if (m) return `kw:${m[1].toLowerCase()}`;
  const cwe = (f.cwe || '').replace('CWE-', '').split(/[:\s]/)[0];
  if (cwe) return `cwe:${cwe}`;
  // fall back to first significant word of message
  const sig = (f.message || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim().split(/\s+/)[0] || 'unknown';
  return `msg:${sig}`;
}

function fingerprint(f) {
  const file = (f.file || '').replace(/^file:\/\//, '');
  const lineBucket = Math.floor((parseInt(f.line) || 0) / 10) * 10;
  const key = `${file}|${lineBucket}|${categoryOf(f)}`;
  return createHash('sha1').update(key).digest('hex');
}

export function dedupeFindings(findings) {
  const seen = new Map();
  const deduped = [];
  let removed = 0;

  for (const f of findings) {
    const fp = fingerprint(f);
    const existing = seen.get(fp);
    if (existing) {
      removed++;
      existing.dedupedFrom = [...new Set([...(existing.dedupedFrom || []), existing.tool, f.tool])];
      // keep the higher-severity one
      const sevRank = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
      if ((sevRank[f.severity] || 0) > (sevRank[existing.severity] || 0)) {
        const merged = { ...f, dedupedFrom: existing.dedupedFrom };
        seen.set(fp, merged);
        const idx = deduped.findIndex(x => x === existing);
        if (idx >= 0) deduped[idx] = merged;
      }
    } else {
      const entry = { ...f, dedupedFrom: [] };
      seen.set(fp, entry);
      deduped.push(entry);
    }
  }

  // Strip the canonical's own tool from dedupedFrom (it's the keeper, not a dupe)
  for (const f of deduped) {
    if (f.dedupedFrom?.length) {
      f.dedupedFrom = [...new Set(f.dedupedFrom.filter(t => t !== f.tool))];
    }
  }

  return { findings: deduped, removed };
}

export class ReportMerger extends BaseAdapter {
  constructor(config = {}) {
    super(config);
    this.registry = config.registry || null;
  }

  canHandle(step) {
    const action = (step.action || '').toLowerCase();
    return action.includes('merge') || action.includes('report') || action.includes('combine') ||
      action.includes('summarize') || action.includes('aggregate');
  }

  async execute(step, context) {
    const results = context.previousResults || [];
    if (results.length === 0) {
      return { report: 'No results to merge.', summary: { total: 0 } };
    }

    const allFindings = [];

    for (const result of results) {
      if (result.findings) {
        allFindings.push(...result.findings);
      }
    }

    const byTool = {};
    for (const f of allFindings) {
      const t = f.tool || 'unknown';
      if (!byTool[t]) byTool[t] = [];
      byTool[t].push(f);
    }

    // Cross-tool dedup (collapse same finding across scanners)
    const { findings: deduped, removed } = dedupeFindings(allFindings);
    if (removed > 0) {
      this.broadcast('step:progress', {
        step: 'merge',
        message: `Deduped ${removed} cross-tool duplicate(s) (${allFindings.length} → ${deduped.length})`,
      });
    }

    // Baseline diffing
    let diffedFindings = deduped;
    if (this.registry && context.repoUrl) {
      const baseline = new BaselineDiff(this.registry);
      const baselineSet = baseline.loadBaseline(context.repoUrl);
      diffedFindings = baseline.diffFindings(deduped, baselineSet);

      const newCount = diffedFindings.filter(f => f.isNew).length;
      const knownCount = diffedFindings.filter(f => !f.isNew).length;

      if (newCount > 0 || knownCount > 0) {
        this.broadcast('step:progress', {
          step: 'merge',
          message: `Baseline diff: ${newCount} new, ${knownCount} known (${deduped.length} total after dedup)`,
        });
      }
    }

    // Rebuild byTool with isNew flags
    const byToolDiffed = {};
    for (const f of diffedFindings) {
      const t = f.tool || 'unknown';
      if (!byToolDiffed[t]) byToolDiffed[t] = [];
      byToolDiffed[t].push(f);
    }

    const newByTool = {};
    const knownByTool = {};
    for (const [tool, items] of Object.entries(byToolDiffed)) {
      newByTool[tool] = items.filter(f => f.isNew).length;
      knownByTool[tool] = items.filter(f => !f.isNew).length;
    }

    const report = {
      summary: {
        totalFindings: allFindings.length,
        dedupedFrom: removed,
        uniqueFindings: deduped.length,
        newFindings: diffedFindings.filter(f => f.isNew).length,
        knownFindings: diffedFindings.filter(f => !f.isNew).length,
        toolsUsed: Object.keys(byToolDiffed),
        breakdown: Object.fromEntries(
          Object.entries(byToolDiffed).map(([tool, items]) => [tool, items.length])
        ),
        newByTool,
        knownByTool,
      },
      details: byToolDiffed,
      generatedAt: new Date().toISOString(),
    };

    this.broadcast('step:progress', { step: 'merge', message: `Merged ${deduped.length} unique findings across ${Object.keys(byToolDiffed).length} tools` });

    return report;
  }
}
