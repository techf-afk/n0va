import { createHash } from 'crypto';

export class BaselineDiff {
  constructor(registry) {
    this.registry = registry;
  }

  fingerprint(finding) {
    return createHash('sha256')
      .update(`${finding.file || ''}:${finding.line || 0}:${finding.message || ''}:${finding.cwe || ''}`)
      .digest('hex');
  }

  loadBaseline(repoUrl) {
    if (!repoUrl) return new Set();
    const prev = this.registry.getLatestExecutionForRepo(repoUrl);
    if (!prev) return new Set();
    let results;
    try {
      results = typeof prev.result === 'string' ? JSON.parse(prev.result) : prev.result;
    } catch {
      return new Set();
    }
    const fingerprints = new Set();
    const steps = Array.isArray(results) ? results : (results.results || []);
    for (const step of steps) {
      if (!step) continue;
      for (const f of (step.findings || [])) {
        fingerprints.add(this.fingerprint(f));
      }
    }
    return fingerprints;
  }

  diffFindings(findings, baseline) {
    return findings.map(f => ({
      ...f,
      isNew: !baseline.has(this.fingerprint(f)),
    }));
  }
}
