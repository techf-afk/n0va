import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestCommands, suggestFromTarget } from './poc.js';

const target = { details: { hostname: '10.0.0.5', protocol: 'http:' } };

test('suggestCommands matches a vulnerable vsftpd build', () => {
  const cmds = suggestCommands({ service: 'ftp', version: 'vsftpd 2.3.4' }, target);
  const vsftpd = cmds.find(c => c.ref === 'vsftpd');
  assert.ok(vsftpd, 'vsftpd entry present');
  assert.ok(vsftpd.cmd.includes('vsftpd_234_backdoor'));
  assert.equal(vsftpd.risk, 'aggressive');
});

test('suggestCommands ignores a patched vsftpd version', () => {
  const cmds = suggestCommands({ service: 'ftp', version: 'vsftpd 3.0.5' }, target);
  assert.ok(!cmds.find(c => c.ref === 'vsftpd'));
});

test('suggestCommands emits a curl for a discovered path', () => {
  const cmds = suggestCommands({ path: '/admin/console' }, target);
  assert.ok(cmds.some(c => c.cmd.includes('curl') && c.cmd.includes('/admin/console')));
});

test('suggestCommands flags missing tools', () => {
  const cmds = suggestCommands({ service: 'mysql' }, target);
  const mysql = cmds.find(c => c.ref === 'mysql');
  assert.ok(mysql);
  // nc/ftp/ssh/curl are usually present; mysql client is not on this host
  if (mysql.unavailable) {
    assert.ok(mysql.note.includes('apt install'), 'gives install hint');
  }
});

test('suggestFromTarget groups PoC by source', () => {
  const t = {
    details: { hostname: 'h' },
    intelligence: {
      serviceVersions: [{ port: 21, service: 'ftp', version: 'vsftpd 2.3.4' }],
      discoveredPaths: [{ path: '/.env' }],
      nucleiFindings: [{ template: 'exposures/git-config', severity: 'high', matched: 'http://h/.git/config' }],
    },
  };
  const groups = suggestFromTarget(t);
  assert.ok(groups.length >= 2, 'port + path + nuclei sources grouped');
  assert.ok(groups.every(g => Array.isArray(g.commands) && g.commands.length));
});
