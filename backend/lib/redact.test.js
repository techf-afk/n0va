import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redactText, redactFinding } from './redact.js';

test('redactText masks a bare AWS key', () => {
  const out = redactText('key=AKIA1234567890ABCDEF secret');
  assert.ok(!out.includes('AKIA1234567890ABCDEF'));
  assert.ok(out.includes('CDEF'), 'keeps last 4 chars');
});

test('redactText masks long high-entropy tokens', () => {
  const out = redactText('token: abcdefghijklmnopqrstuvwxyz0123456789');
  assert.ok(!out.includes('abcdefghijklmnopqrstuvwxyz0123456789'));
  assert.ok(out.includes('6789'));
});

test('redactText keeps quoted secrets but masks inner value', () => {
  const out = redactText('"api_key": "supersecretvaluethatislong"');
  assert.ok(!out.includes('supersecretvaluethatislong'));
  assert.ok(out.includes('"'), 'quotes preserved');
});

test('redactText leaves short values untouched', () => {
  assert.equal(redactText('x=abc'), 'x=abc');
});

test('redactText returns non-strings unchanged', () => {
  assert.equal(redactText(null), null);
  assert.equal(redactText(123), 123);
});

test('redactFinding masks known secret raw fields', () => {
  const finding = { message: 'leak', raw: { password: 'hunter2passwordlong123' } };
  const out = redactFinding(finding);
  assert.notEqual(out.raw.password, 'hunter2passwordlong123');
  assert.ok(out.raw.password.endsWith('123'), 'keeps last 4 chars');
});
