import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResponsePlan } from '../public/response.js';

test('file and network anomalies trigger triage without inferring credential exposure', () => {
  const result = buildResponsePlan({
    report: { allowed: false, rows: [{ state: 'match' }, { state: 'changed' }, { state: 'missing' }] },
    network: { alerts: 1 },
    consensus: { normal: 47, anomalous: 3 },
    execution: 'staged', assets: ['passwords', 'sessions', 'api'],
  });
  assert.equal(result.level, 'signals');
  assert.equal(result.canQuarantine, true);
  assert.deepEqual(result.evidence, {
    releaseChecked: true, releaseBlocked: true, differences: 2,
    networkAlerts: 1, anomalousNodes: 3, simulatedExecution: false,
  });
  assert.deepEqual(result.actions.map(({ id }) => id), ['hold', 'evidence', 'network', 'nodes', 'restore']);
});

test('credential actions require modeled execution and respect the selected asset categories', () => {
  const result = buildResponsePlan({ execution: 'ran', assets: ['sessions', 'ssh'] });
  assert.equal(result.level, 'assumed');
  assert.equal(result.evidence.simulatedExecution, true);
  assert.deepEqual(result.actions.filter(({ cleanDevice }) => cleanDevice),
    [{ id: 'sessions', priority: 2, cleanDevice: true }, { id: 'ssh', priority: 2, cleanDevice: true }]);
});

test('pending and verified runs expose no synthetic quarantine unless there is a signal', () => {
  assert.equal(buildResponsePlan({}).level, 'pending');
  const result = buildResponsePlan({
    report: { allowed: true, rows: [{ state: 'match' }] },
    network: { alerts: 0 },
    consensus: { normal: 50, anomalous: 0 },
  });
  assert.equal(result.level, 'checked');
  assert.equal(result.canQuarantine, false);
});
