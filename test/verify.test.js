import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newPublisher, publishRelease, sha256, textBytes, verifyRelease } from '../public/verify.js';

const publisher = await newPublisher();
const original = new Map([['config.json', textBytes('{"mode":"normal"}')], ['bytes.bin', Uint8Array.of(0, 255, 8)]]);
const release = await publishRelease(publisher, 7, original);

test('publisher signs typed text and exact binary file bytes', async () => {
  const report = await verifyRelease(publisher.publicKey, release.signature, release.manifest, original);
  assert.equal(report.allowed, true);
  assert.deepEqual(report.rows.map(({ state }) => state), ['match', 'match']);
  assert.equal(report.version, 7);
  assert.equal(publisher.privateKey.extractable, false);
});

test('modified, missing and extra delivery bytes are reported without changing the signed baseline', async () => {
  const different = new Map([['config.json', textBytes('{"mode":"other"}')], ['unlisted.txt', textBytes('sample')]]);
  const report = await verifyRelease(publisher.publicKey, release.signature, release.manifest, different);
  assert.equal(report.signatureValid, true);
  assert.equal(report.allowed, false);
  assert.deepEqual(report.rows.map(({ state }) => state), ['changed', 'missing', 'extra']);
  assert.equal(release.manifest.files[0].sha256, await sha256(original.get('config.json')));
});

test('a rewritten manifest with matching hashes does not pass the original signature', async () => {
  const different = new Map(original);
  different.set('bytes.bin', Uint8Array.of(0, 255, 9));
  const rewritten = structuredClone(release.manifest);
  rewritten.files[1].sha256 = await sha256(different.get('bytes.bin'));
  const report = await verifyRelease(publisher.publicKey, release.signature, rewritten, different);
  assert.ok(report.rows.every(({ state }) => state === 'match'));
  assert.equal(report.signatureValid, false);
  assert.equal(report.allowed, false);
});
