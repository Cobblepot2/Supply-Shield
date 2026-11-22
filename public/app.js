import { fixture } from './fixture.js';
import { auditConnections, compareNodes, verifyRelease } from './verify.js';
import { strings } from './copy.js';

const baseline = JSON.parse(fixture.manifest);
const approved = Object.fromEntries(baseline.files.map(({ id, sha256 }) => [id, sha256]));
const $ = (id) => document.getElementById(id);
const resource = $('resource');
const editor = $('editor');
const expected = $('expected');
const actual = $('actual');
const tabs = [...document.querySelectorAll('[data-tab]')];

let lang = new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : 'zh';
let samples = { ...fixture.samples };
let listed = { ...approved };
let measured = {};
let runSerial = 0;
let probeSerial = 0;
let state = { type: 'pending' };
let networkExtra = false;
let nodeState = null;
let quarantined = false;
let copyStatus = '';
let activeTab = 'integrity';
let events = [];

const hostPolicy = ['release-cdn.example'];
const w = () => strings[lang];
const current = () => resource.value;

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function connectionRows() {
  const observations = [{ source: 'launcherRequest', host: hostPolicy[0] }];
  if (networkExtra) observations.push({ source: 'exampleRequest', host: 'unrecognized.example' });
  return auditConnections(observations, hostPolicy);
}

function record(action, detail = '') {
  if (action.startsWith('log') && events.at(-1)?.action === action && events.at(-1)?.detail === detail) return;
  events.push({ at: new Date().toISOString(), action, detail });
  if (events.length > 12) events.shift();
}

function table(headers, values) {
  const wrapper = el('div', undefined, 'table-scroll');
  const grid = el('table');
  const head = grid.createTHead().insertRow();
  for (const heading of headers) {
    const cell = el('th', heading);
    cell.scope = 'col';
    head.append(cell);
  }
  const body = grid.createTBody();
  for (const row of values) {
    const tr = body.insertRow();
    for (const value of row) tr.append(Array.isArray(value) ? el('td', value[0], value[1]) : el('td', value));
  }
  wrapper.append(grid);
  return wrapper;
}

function drawEvidence() {
  const t = w();
  const file = $('fileEvidence');
  file.replaceChildren();
  if (!state.rows?.length) {
    file.append(el('p', t.evidenceWait, 'hint'));
  } else {
    if (!state.signatureValid) file.append(el('p', t.compareNote, 'hint'));
    file.append(table([t.path, t.verdict, t.listed, t.measured], state.rows.map((row) => [
      [row.id, 'mono'], [row.match ? t.match : t.changed, row.match ? 'good' : 'bad'],
      [row.expected, 'hash'], [row.actual, 'hash'],
    ])));
  }

  const log = $('eventLog');
  log.replaceChildren(el('h3', t.logTitle));
  const rows = el('ol', undefined, 'events');
  const clock = new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-GB', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  for (const entry of events.slice(-5).reverse()) {
    const line = el('li');
    const time = el('time', clock.format(new Date(entry.at)));
    time.dateTime = entry.at;
    line.append(time, el('span', t[entry.action] + (entry.detail ? ' · ' + entry.detail : '')));
    rows.append(line);
  }
  log.append(rows);

  $('networkToggle').textContent = networkExtra ? t.hideRequest : t.showRequest;
  $('networkToggle').setAttribute('aria-pressed', String(networkExtra));
  $('networkEvidence').replaceChildren(table([t.origin, t.host, t.policy], connectionRows().map((row) => [
    t[row.source], [row.host, 'mono'],
    [row.accepted ? t.allowedHost : t.rejectedHost, row.accepted ? 'good' : 'bad'],
  ])));

  const nodeBox = $('nodeEvidence');
  nodeBox.replaceChildren();
  if (!nodeState?.rows) {
    nodeBox.append(el('p', nodeState?.state ? t[nodeState.state] : t.nodeWait, 'hint'));
  } else {
    nodeBox.append(el('p', nodeState.kind === 'all' ? t.nodeAll : t.nodeOne, 'hint'));
    nodeBox.append(table([t.node, t.path, t.measured, t.verdict], nodeState.rows.map((row) => [
      row.name, [nodeState.id, 'mono'], [row.hash, 'hash'],
      [row.match ? t.nodeMatch : t.nodeChanged, row.match ? 'good' : 'bad'],
    ])));
  }
  for (const id of ['probeOne', 'probeAll']) {
    $(id).disabled = samples[current()] === fixture.samples[current()] || nodeState?.state === 'nodeBusy';
  }

  $('contain').disabled = state.type !== 'blocked' || !state.rows || quarantined;
  $('export').disabled = !state.rows;
  $('responseEvidence').textContent = quarantined ? t.contained : t.noContain;
  $('responseEvidence').className = quarantined ? 'contained' : 'hint';
  $('checklist').replaceChildren(...t.checklist.map((item) => el('li', item)));
}

function drawResult() {
  const t = w();
  const data = {
    pending: [t.pending, t.pendingNote, '·'],
    running: [t.running, t.runningNote, '…'],
    allowed: [t.allowed, t.allowedNote, '✓'],
    blocked: [t.blocked, t[state.reason], '×'],
  }[state.type];
  const stamp = el('span', data[2], 'stamp');
  stamp.setAttribute('aria-hidden', 'true');
  const message = el('div');
  message.append(el('strong', data[0], 'verdict-title'), el('p', data[1]));
  const panel = $('verdict');
  panel.dataset.state = state.type;
  panel.replaceChildren(stamp, message);
  $('pathState').textContent = data[0];
  $('pathState').className = 'pill ' + (state.type === 'allowed' ? 'stable' : state.type === 'blocked' ? 'danger' : 'neutral');

  const count = state.rows?.filter(({ match }) => match).length;
  const metrics = [
    [t.signature, state.signatureValid === undefined ? t.waiting : state.signatureValid ? t.valid : t.invalid],
    [t.hashes, state.rows ? t.count(count, state.rows.length) : t.waiting],
    [t.net, String(connectionRows().filter(({ accepted }) => !accepted).length)],
  ];
  $('signals').replaceChildren(...metrics.map(([label, value]) => {
    const item = el('div');
    item.append(el('span', label), el('strong', value));
    return item;
  }));
  $('run').disabled = state.type === 'running';
  const digest = measured[current()] ?? '';
  if (actual.value !== digest) actual.value = digest;
  $('copyHash').disabled = !digest;
  $('copyStatus').hidden = !copyStatus;
  $('copyStatus').textContent = t[copyStatus] ?? '';
  drawEvidence();
}

async function run() {
  const ticket = ++runSerial;
  copyStatus = '';
  state = { type: 'running' };
  drawResult();
  if (!Object.values(listed).every((digest) => /^[a-f0-9]{64}$/.test(digest))) {
    state = { type: 'blocked', reason: 'invalidNote' };
    record('blocked');
    drawResult();
    return;
  }
  try {
    const candidate = {
      release: baseline.release,
      files: baseline.files.map(({ id }) => ({ id, sha256: listed[id] })),
    };
    const start = performance.now();
    const report = await verifyRelease(fixture, { ...samples }, candidate);
    if (ticket !== runSerial) return;
    const durationMs = Math.round((performance.now() - start) * 10) / 10;
    measured = Object.fromEntries(report.rows.map(({ id, actual: digest }) => [id, digest]));
    state = {
      ...report, type: report.allowed ? 'allowed' : 'blocked', durationMs,
      reason: report.allowed ? undefined : report.signatureValid ? 'mismatchNote' : 'signatureNote',
    };
    record(state.type);
  } catch {
    if (ticket !== runSerial) return;
    state = { type: 'blocked', reason: 'errorNote' };
    record('blocked');
  }
  drawResult();
}

function reset() {
  samples = { ...fixture.samples };
  listed = { ...approved };
  measured = {};
  state = { type: 'pending' };
  events = [];
  networkExtra = false;
  nodeState = null;
  probeSerial++;
  quarantined = false;
  copyStatus = '';
  resource.selectedIndex = 0;
  chooseResource();
  void run();
}

function chooseResource() {
  editor.value = samples[current()];
  expected.value = listed[current()];
  probeSerial++;
  nodeState = null;
  copyStatus = '';
  drawResult();
}

function edited(action) {
  runSerial++;
  state = { type: 'pending' };
  quarantined = false;
  copyStatus = '';
  record(action, current());
  drawResult();
}

function activateTab(name, focus = false) {
  activeTab = name;
  for (const item of tabs) {
    const selected = name === item.dataset.tab;
    item.setAttribute('aria-selected', String(selected));
    item.tabIndex = selected ? 0 : -1;
    $(item.getAttribute('aria-controls')).hidden = !selected;
    if (focus && selected) item.focus();
  }
}

function applyLanguage() {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  $('language').lang = lang === 'zh' ? 'en' : 'zh-CN';
  $('language').textContent = lang === 'zh' ? 'EN' : '中文';
  $('language').setAttribute('aria-label', lang === 'zh' ? 'Switch to English' : '切换到中文');
  for (const node of document.querySelectorAll('[data-copy]')) node.textContent = w()[node.dataset.copy];
  $('caseTimeline').replaceChildren(...w().timeline.map(([date, event]) => {
    const item = el('li');
    item.append(el('strong', date), el('span', event));
    return item;
  }));
  activateTab(activeTab);
  drawResult();
}

async function probe(kind) {
  const ticket = ++probeSerial;
  const id = current();
  const original = fixture.samples[id];
  const candidate = samples[id];
  if (original === candidate) return;
  nodeState = { state: 'nodeBusy' };
  drawEvidence();
  try {
    const sources = ['A', 'B', 'C'].map((name) => ({
      name, contents: kind === 'all' || name === 'C' ? candidate : original,
    }));
    const rows = await compareNodes(approved[id], sources);
    if (ticket !== probeSerial) return;
    nodeState = { id, kind, rows };
  } catch {
    if (ticket !== probeSerial) return;
    nodeState = { state: 'nodeError' };
  }
  drawEvidence();
}

resource.append(...baseline.files.map(({ id }) => {
  const option = el('option', id);
  option.value = id;
  return option;
}));
resource.addEventListener('change', chooseResource);
editor.addEventListener('input', () => {
  samples[current()] = editor.value;
  delete measured[current()];
  probeSerial++;
  nodeState = null;
  edited('logEdit');
});
expected.addEventListener('input', () => {
  listed[current()] = expected.value;
  edited('logManifest');
});
$('run').addEventListener('click', run);
$('reset').addEventListener('click', reset);
$('language').addEventListener('click', () => {
  lang = lang === 'zh' ? 'en' : 'zh';
  applyLanguage();
});
$('copyHash').addEventListener('click', async () => {
  const value = actual.value;
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    if (actual.value !== value) return;
    copyStatus = 'copied';
  } catch {
    if (actual.value !== value) return;
    actual.focus();
    actual.select();
    copyStatus = 'selected';
  }
  drawResult();
});
for (const [index, item] of tabs.entries()) {
  item.addEventListener('click', () => activateTab(item.dataset.tab));
  item.addEventListener('keydown', (event) => {
    const target = { ArrowLeft: (index + tabs.length - 1) % tabs.length,
      ArrowRight: (index + 1) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    activateTab(tabs[target].dataset.tab, true);
  });
}
$('networkToggle').addEventListener('click', () => {
  networkExtra = !networkExtra;
  drawResult();
});
$('probeOne').addEventListener('click', () => probe('one'));
$('probeAll').addEventListener('click', () => probe('all'));
$('contain').addEventListener('click', () => {
  if (state.type !== 'blocked' || !state.rows || quarantined) return;
  quarantined = true;
  record('logQuarantine');
  drawEvidence();
});
$('export').addEventListener('click', () => {
  if (!state.rows) return;
  const report = {
    title: 'Supply Shield classroom report', simulation: true, at: new Date().toISOString(),
    release: baseline.release, check: state, requests: connectionRows(), nodeComparison: nodeState?.rows ? nodeState : null,
    simulatedQuarantine: quarantined, events,
  };
  const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  const link = el('a');
  link.href = objectUrl;
  link.download = 'supply-shield-report.json';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
});

applyLanguage();
reset();
