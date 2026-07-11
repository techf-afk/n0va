import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dedupeFindings } from '../adapters/report-merger.js';

test('dedupe collapses same finding from two tools', () => {
  const findings = [
    { file: 'src/a.js', line: 12, cwe: 'CWE-79', severity: 'medium', tool: 'semgrep', message: 'xss found here' },
    { file: 'src/a.js', line: 15, cwe: 'CWE-79', severity: 'high', tool: 'gitleaks', message: 'xss found here' },
  ];
  const { findings: deduped, removed } = dedupeFindings(findings);
  assert.equal(deduped.length, 1, 'one unique finding remains');
  assert.equal(removed, 1, 'one duplicate removed');
  assert.equal(deduped[0].severity, 'high', 'higher severity kept');
});

test('dedupe keeps distinct CWEs separate', () => {
  const findings = [
    { file: 'src/a.js', line: 12, cwe: 'CWE-79', severity: 'medium', tool: 'semgrep', message: 'xss' },
    { file: 'src/a.js', line: 12, cwe: 'CWE-89', severity: 'medium', tool: 'semgrep', message: 'sqli' },
  ];
  const { findings: deduped } = dedupeFindings(findings);
  assert.equal(deduped.length, 2, 'different CWE = not a duplicate');
});

test('dedupe records dedupedFrom as the other tool', () => {
  const findings = [
    { file: 'a', cwe: 'CWE-79', severity: 'medium', tool: 'semgrep', message: 'x' },
    { file: 'a', cwe: 'CWE-79', severity: 'high', tool: 'gitleaks', message: 'x' },
  ];
  const { findings: deduped } = dedupeFindings(findings);
  assert.ok(deduped[0].dedupedFrom.includes('semgrep'));
  assert.ok(!deduped[0].dedupedFrom.includes('gitleaks'), 'keeper tool not listed as dupe');
});

test('dedupe line-buckets tolerate small line drift', () => {
  const findings = [
    { file: 'a.js', line: 21, cwe: 'CWE-79', severity: 'medium', tool: 'semgrep', message: 'x' },
    { file: 'a.js', line: 27, cwe: 'CWE-79', severity: 'medium', tool: 'gitleaks', message: 'x' },
  ];
  const { findings: deduped } = dedupeFindings(findings);
  assert.equal(deduped.length, 1, 'lines 21 and 27 fall in same 10-line bucket');
});
