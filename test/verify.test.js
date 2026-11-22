import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../public/fixture.js';
import { auditConnections, compareNodes, sha256, verifyRelease } from '../public/verify.js';

const original = JSON.parse(fixture.manifest);
const selected = original.files[0];
const edit = { ...fixture.samples, [selected.id]: fixture.samples[selected.id] + '// pre' };

test('authorized release passes its publisher signature and all four contents', async () => {
  const result = await verifyRelease(fixture, fixture.samples, original);
  assert.equal(result.signatureValid, true);
  assert.equal(result.allowed, true);
  assert.equal(result.rows.filter(({ match }) => match).length, 4);
});

test('changing one script blocks loading while the publisher signature still passes', async () => {
  const result = await verifyRelease(fixture, edit, original);
  assert.equal(result.signatureValid, true);
  assert.equal(result.allowed, false);
  assert.deepEqual(result.rows.filter(({ match }) => !match).map(({ id }) => id), [selected.id]);
});

test('matching a rewritten manifest still blocks loading because its signature fails', async () => {
  const editedManifest = structuredClone(original);
  editedManifest.files[0].sha256 = await sha256(edit[selected.id]);
  const result = await verifyRelease(fixture, edit, editedManifest);
  assert.equal(result.rows.filter(({ match }) => match).length, 4);
  assert.equal(result.signatureValid, false);
  assert.equal(result.allowed, false);
});

test('equally changed node copies agree with each other and fail the trusted reference', async () => {
  const copies = ['A','B','C'].map((name) => ({ name, contents: edit[selected.id] }));
  const result = await compareNodes(selected.sha256, copies);
  assert.equal(new Set(result.map(({ hash }) => hash)).size, 1);
  assert.ok(result.every(({ match }) => !match));
});

test('the synthetic allowlist flags requests to unlisted hosts', () => {
  const requests = [{ host: 'release-cdn.example' }, { host: 'unrecognized.example' }];
  assert.deepEqual(auditConnections(requests, ['release-cdn.example']).map(({ accepted }) => accepted), [true, false]);
});
