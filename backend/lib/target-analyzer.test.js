import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TargetAnalyzer } from './target-analyzer.js';

const ta = new TargetAnalyzer({});

test('isIpLike recognizes IPv4 addresses', () => {
  assert.equal(ta.isIpLike('127.0.0.1'), true);
  assert.equal(ta.isIpLike('192.168.1.10'), true);
});

test('isIpLike rejects hostnames', () => {
  assert.equal(ta.isIpLike('localhost'), false);
  assert.equal(ta.isIpLike('example.com'), false);
  assert.equal(ta.isIpLike(''), false);
});

test('analyze classifies a GitHub repo URL', () => {
  const r = ta.analyze('https://github.com/owner/repo');
  assert.equal(r.type, 'git-repo');
  assert.equal(r.subtype, 'github');
  assert.ok(r.confidence > 0.5, 'high confidence classification');
});

test('analyze classifies a local path', () => {
  const r = ta.analyze('./my-project');
  assert.equal(r.type, 'local-path');
});

test('analyze classifies a plain web URL', () => {
  const r = ta.analyze('https://example.com/login');
  assert.equal(r.type, 'web-app');
  assert.equal(r.details.hostname, 'example.com');
});
