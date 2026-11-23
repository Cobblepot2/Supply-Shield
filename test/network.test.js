import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAuditHost, parseAuditAllowlist, inspectAuditDestination } from '../public/network.js';

test('normalizes a hostname, URL, port and trailing DNS dot to the same host', () => {
  assert.equal(normalizeAuditHost('  Update.Example.  '), 'update.example');
  assert.equal(normalizeAuditHost('https://UPDATE.EXAMPLE:8443/releases/v2?trace=1'), 'update.example');
  assert.equal(normalizeAuditHost('update.example:8443/releases/v2'), 'update.example');
});

test('matches exactly, including punycode normalization and explicit subdomain entries', () => {
  const allowlist = parseAuditAllowlist('UPDATE.EXAMPLE\nsub.update.example\n\nbücher.example\nupdate.example');
  assert.deepEqual(allowlist, ['update.example', 'sub.update.example', 'xn--bcher-kva.example']);
  assert.deepEqual(inspectAuditDestination(allowlist, 'https://SUB.UPDATE.EXAMPLE/test'),
    { host: 'sub.update.example', allowed: true });
  assert.equal(inspectAuditDestination(allowlist, 'another.update.example').allowed, false);
  assert.equal(inspectAuditDestination(allowlist, 'update.example.unlisted.example').allowed, false);
  assert.equal(inspectAuditDestination(allowlist, 'https://xn--bcher-kva.example').allowed, true);
});

test('rejects malformed destinations instead of silently choosing another host', () => {
  for (const target of ['', '*.example', 'ftp://update.example', 'https://user@update.example',
    'https://@update.example', 'https:///update.example', 'https://up date.example', 'https:\\\\update.example',
    'https://update..example', '-update.example', 'https://a%2eupdate.example']) {
    assert.throws(() => normalizeAuditHost(target), JSON.stringify(target));
  }
});

test('an explicitly applied empty allowlist alerts on every valid host', () => {
  assert.deepEqual(inspectAuditDestination(parseAuditAllowlist('\n \n'), 'update.example'),
    { host: 'update.example', allowed: false });
  assert.throws(() => parseAuditAllowlist(Array.from({ length: 65 }, (_, index) => 'host-' + index + '.example').join('\n')), /policyLimit/);
});
