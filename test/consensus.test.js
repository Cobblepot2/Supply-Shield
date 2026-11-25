import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateConsensus, makeConsensusReports } from '../public/consensus.js';

const baselineHash = 'a'.repeat(64);
const currentHash = 'b'.repeat(64);

test('default distribution starts with all 50 nodes matching the release', () => {
  const config = { baselineHash, currentHash: baselineHash };
  const result = aggregateConsensus(makeConsensusReports(config), config);
  assert.equal(result.mode, 'baseline');
  assert.equal(result.normalCount, 50);
  assert.equal(result.anomalyCount, 0);
  assert.equal(result.consensusRatio, 1);
  assert.equal(result.currentMatchesBaseline, true);
  assert.deepEqual(result.anomalyRegions, []);
});

test('regional simulation aggregates 47 baseline matches and three west coast anomalies', () => {
  const config = { baselineHash, currentHash, mode: 'regional' };
  const reports = makeConsensusReports(config);
  const result = aggregateConsensus(reports, config);
  assert.equal(new Set(reports.map(({ id }) => id)).size, 50);
  assert.equal(result.nodeCount, 50);
  assert.equal(result.normalCount, 47);
  assert.equal(result.anomalyCount, 3);
  assert.equal(result.consensusRatio, 0.94);
  assert.equal(result.consensusHash, baselineHash);
  assert.deepEqual(result.anomalyRegions, ['us-west']);
  assert.equal(result.currentMatchesConsensus, false);
  assert.equal(result.currentMatchesBaseline, false);
});

test('synchronized reports can agree completely and still differ from the baseline', () => {
  const config = { baselineHash, currentHash, mode: 'synchronized' };
  const result = aggregateConsensus(makeConsensusReports(config), config);
  assert.equal(result.consensusRatio, 1);
  assert.equal(result.consensusHash, currentHash);
  assert.equal(result.currentMatchesConsensus, true);
  assert.equal(result.consensusMatchesBaseline, false);
  assert.equal(result.anomalyCount, 50);
  assert.equal(result.normalCount, 0);
});

test('tie does not produce a majority or override the publisher baseline', () => {
  const result = aggregateConsensus([
    { hash: currentHash, region: 'west' },
    { hash: baselineHash, region: 'east' },
  ], { baselineHash, currentHash });
  assert.equal(result.consensusHash, null);
  assert.equal(result.currentMatchesConsensus, null);
  assert.equal(result.consensusMatchesBaseline, null);
  assert.equal(result.currentMatchesBaseline, false);
  assert.equal(result.anomalyCount, 1);
});
