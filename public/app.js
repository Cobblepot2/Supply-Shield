import { exampleFiles, newPublisher, publishRelease, textBytes, verifyRelease } from './verify.js';
import { shellCopy } from './copy.js';
import { createNetwork } from './network.js';
import { createConsensus } from './consensus.js';
import { createResponse } from './response.js';

const byId = (id) => document.getElementById(id);
const draftFile = byId('draftFile');
const receivedFile = byId('receivedFile');
const sourceText = byId('publisherEdit');
const receivedText = byId('receivedEdit');
const signedField = byId('listedHash');
const actualField = byId('actualHash');
const tabs = [...document.querySelectorAll('[data-tab]')];
const params = new URLSearchParams(location.search);
const decoder = new TextDecoder('utf-8', { fatal: true });
const maxFileBytes = 8 * 1024 ** 2;
const maxSetBytes = 40 * 1024 ** 2;
const maxFiles = 20;
const nameValid = (name) => name.length > 0 && name.length <= 96 &&
  name !== '.' && name !== '..' && !['/', '\\', ':'].some((character) => name.includes(character));

let lang = params.get('lang') === 'en' ? 'en' : 'zh';
let activeTab = tabs.some((tab) => tab.dataset.tab === params.get('tab')) ? params.get('tab') : 'integrity';
let draft = new Map();
let delivered = new Map();
let approvedFiles = new Map();
let publisher = null;
let release = null;
let receivedManifest = null;
let measured = new Map();
let report = null;
let phase = 'pending';
let reason = '';
let busy = false;
let draftDirty = false;
let deliveryDirty = false;
let job = 0;
let draftMessage = '';
let clientMessage = '';
let clipboardMessage = '';
let lastConsensus = '';
const words = () => shellCopy[lang];

function el(tag, text, kind) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (kind) node.className = kind;
  return node;
}

let network;
let consensus;
const response = createResponse(byId('responsePane'));

function syncResponse() {
  const summary = consensus?.getSummary();
  const audit = network?.getSummary();
  response.update({
    lang, report, network: audit ? { ...audit, alerts: audit.currentAlerts ?? audit.alerts } : null,
    consensus: summary ? { ...summary, normal: summary.normalCount, anomalous: summary.anomalyCount } : null,
  });
}

network = createNetwork(byId('networkPane'), { onChange: syncResponse });
consensus = createConsensus(byId('consensusPane'), { onChange: syncResponse });

function currentNames() {
  return [...new Set([...(receivedManifest?.files.map(({ id }) => id) ?? []), ...delivered.keys()])];
}

function drawSelection(select, items, preferred = select.value) {
  const name = items.includes(preferred) ? preferred : items[0] ?? '';
  select.replaceChildren(...(items.length ? items.map((id) => {
    const option = el('option', id);
    option.value = id;
    return option;
  }) : [el('option', words().noFile)]));
  if (!items.length) select.options[0].value = '';
  select.value = name;
  select.disabled = !items.length;
}

function fillEditor(editor, bytes) {
  let value = '';
  let editable = Boolean(bytes);
  if (bytes) {
    try {
      if (bytes.length > 300000 || bytes.includes(0)) throw new Error('Binary or long input');
      value = decoder.decode(bytes);
      if (value.length > 300000) throw new Error('Long input');
    } catch {
      editable = false;
      value = words().binary;
    }
  }
  editor.value = value;
  editor.disabled = !editable;
}

function drawDraft(preferred = draftFile.value) {
  drawSelection(draftFile, [...draft.keys()], preferred);
  fillEditor(sourceText, draft.get(draftFile.value));
}

function drawReceived(preferred = receivedFile.value) {
  drawSelection(receivedFile, currentNames(), preferred);
  fillEditor(receivedText, delivered.get(receivedFile.value));
  const entry = receivedManifest?.files.find(({ id }) => id === receivedFile.value);
  signedField.value = entry?.sha256 ?? '';
  signedField.disabled = !entry;
}

function syncContext() {
  const filename = receivedFile.value || release?.manifest.files[0]?.id || null;
  const baselineHash = release?.manifest.files.find(({ id }) => id === filename)?.sha256 ?? null;
  const currentHash = baselineHash ? measured.get(filename) ?? null : null;
  const stamp = JSON.stringify([lang, filename, baselineHash, currentHash]);
  network.update({ lang, filename, releaseVersion: receivedManifest?.version ?? null });
  if (lastConsensus !== stamp) {
    lastConsensus = stamp;
    consensus.update({ lang, filename: baselineHash ? filename : null, baselineHash, currentHash });
  }
  syncResponse();
}

function drawEvidence() {
  const w = words();
  const host = byId('fileEvidence');
  if (!report) {
    host.replaceChildren(el('p', w.evidenceWait, 'hint'));
    return;
  }
  const wrap = el('div', undefined, 'table-scroll');
  const table = el('table');
  const head = table.createTHead().insertRow();
  for (const name of [w.path, w.result, w.expected, w.actual]) {
    const cell = el('th', name);
    cell.scope = 'col';
    head.append(cell);
  }
  const body = table.createTBody();
  for (const row of report.rows) {
    const tr = body.insertRow();
    tr.append(el('td', row.id, 'mono'), el('td', w[row.state], row.state === 'match' ? 'good' : 'bad'),
      el('td', row.expected ?? '—', 'hash'), el('td', row.actual ?? '—', 'hash'));
  }
  wrap.append(table);
  host.replaceChildren();
  if (!report.signatureValid) host.append(el('p', w.evidenceNote, 'hint'));
  host.append(wrap);
}

function draw() {
  const w = words();
  const summaries = {
    pending: [w.pending, deliveryDirty ? w.edited : w.pendingNote, '·'],
    running: [w.running, w.runningNote, '…'],
    allowed: [w.allowed, w.allowedNote, '✓'],
    blocked: [w.blocked, w[reason], '×'],
  };
  const [title, message, symbol] = summaries[phase];
  const verdict = byId('verdict');
  const icon = el('span', symbol, 'stamp');
  icon.setAttribute('aria-hidden', 'true');
  const text = el('div');
  text.append(el('strong', title, 'verdict-title'), el('p', message));
  verdict.dataset.state = phase;
  verdict.replaceChildren(icon, text);
  const metrics = [
    [w.release, release ? 'v' + release.manifest.version : '—'],
    [w.signature, report ? (report.signatureValid ? w.valid : w.invalid) : '—'],
    [w.comparing, report ? w.count(report.rows.filter(({ state }) => state === 'match').length, report.rows.length) : '—'],
  ];
  byId('signals').replaceChildren(...metrics.map(([label, value]) => {
    const metric = el('div');
    metric.append(el('span', label), el('strong', value));
    return metric;
  }));

  byId('releaseStatus').textContent = draftMessage ? w[draftMessage] : draftDirty ? w.draftUpdated
    : release ? w.signed(release.manifest.version, release.manifest.files.length) : '';
  byId('cloudStatus').textContent = clientMessage ? w[clientMessage] : deliveryDirty ? w.edited
    : receivedManifest ? w.staged(receivedManifest.version) : w.waitingReceive;
  byId('draftBytes').textContent = draft.has(draftFile.value)
    ? w.byteCount(draft.get(draftFile.value).byteLength) : w.byteLimit;
  byId('receivedBytes').textContent = delivered.has(receivedFile.value)
    ? w.byteCount(delivered.get(receivedFile.value).byteLength) : '';
  const currentHash = measured.get(receivedFile.value) ?? '';
  if (actualField.value !== currentHash) actualField.value = currentHash;
  byId('copyStatus').textContent = w[clipboardMessage] ?? '';
  byId('copyHash').disabled = !currentHash;
  byId('publish').disabled = busy || !draft.size || !publisher;
  byId('receive').disabled = busy || !release;
  byId('run').disabled = busy || !receivedManifest || phase === 'running';
  byId('importSource').disabled = busy;
  byId('importReceived').disabled = busy || !receivedManifest;
  byId('removeDraft').disabled = busy || !draft.has(draftFile.value);
  byId('removeReceived').disabled = busy || !delivered.has(receivedFile.value);
  byId('addFile').disabled = busy || draft.size >= maxFiles;
  byId('reset').disabled = busy;
  drawEvidence();
  syncContext();
}

function invalidate() {
  job++;
  report = null;
  phase = 'pending';
  clipboardMessage = '';
}

async function publish() {
  const source = new Map(draft);
  const version = (release?.manifest.version ?? 0) + 1;
  busy = true;
  draw();
  try {
    release = await publishRelease(publisher, version, source);
    approvedFiles = source;
    draftDirty = draft.size !== source.size || [...source].some(([id, data]) => draft.get(id) !== data);
    draftMessage = '';
    delivered = new Map();
    receivedManifest = null;
    measured = new Map();
    deliveryDirty = false;
    clientMessage = '';
    drawReceived();
    invalidate();
  } catch {
    invalidate();
    phase = 'blocked';
    reason = 'failure';
  } finally {
    busy = false;
    draw();
  }
}

function receive() {
  if (!release) return;
  delivered = new Map(approvedFiles);
  receivedManifest = structuredClone(release.manifest);
  measured = new Map();
  deliveryDirty = false;
  clientMessage = '';
  invalidate();
  drawReceived();
  draw();
}

async function verify() {
  if (!receivedManifest) return;
  const ticket = ++job;
  phase = 'running';
  report = null;
  clipboardMessage = '';
  draw();
  if (!receivedManifest.files.every(({ sha256 }) => /^[0-9a-f]{64}$/.test(sha256))) {
    phase = 'blocked';
    reason = 'invalidHash';
    draw();
    return;
  }
  try {
    const checked = await verifyRelease(publisher.publicKey, release.signature,
      structuredClone(receivedManifest), new Map(delivered));
    if (ticket !== job) return;
    report = checked;
    measured = new Map(checked.rows.filter(({ actual }) => actual !== null).map(({ id, actual }) => [id, actual]));
    phase = checked.allowed ? 'allowed' : 'blocked';
    reason = checked.signatureValid ? 'mismatch' : 'badSignature';
  } catch {
    if (ticket !== job) return;
    phase = 'blocked';
    reason = 'failure';
  }
  draw();
}

async function readSet(input, existing) {
  const files = [...input.files];
  input.value = '';
  if (files.length === 0) return null;
  const identities = new Set(files.map(({ name }) => name));
  if (identities.size !== files.length || files.some(({ name, size }) => !nameValid(name) || size > maxFileBytes)) {
    throw new Error('Invalid file selection');
  }
  const total = files.reduce((sum, file) => sum + file.size, 0) +
    [...existing].reduce((sum, [id, bytes]) => sum + (identities.has(id) ? 0 : bytes.byteLength), 0);
  if (total > maxSetBytes || new Set([...existing.keys(), ...identities]).size > maxFiles) throw new Error('File limits');
  const next = new Map(existing);
  for (const file of files) next.set(file.name, new Uint8Array(await file.arrayBuffer()));
  return { next, first: files[0].name };
}

async function importFiles(input, source) {
  busy = true;
  draw();
  try {
    const result = await readSet(input, source ? new Map() : delivered);
    if (!result) return;
    if (source) {
      draft = result.next;
      draftDirty = true;
      draftMessage = '';
      drawDraft(result.first);
    } else {
      delivered = result.next;
      deliveryDirty = true;
      clientMessage = '';
      measured.clear();
      invalidate();
      drawReceived(result.first);
    }
  } catch {
    if (source) draftMessage = 'fileLimit';
    else clientMessage = 'fileLimit';
  } finally {
    busy = false;
    draw();
  }
}

async function reset() {
  invalidate();
  network.reset();
  consensus.reset();
  response.reset();
  lastConsensus = '';
  release = null;
  receivedManifest = null;
  draft = new Map(Object.entries(exampleFiles).map(([id, value]) => [id, textBytes(value)]));
  delivered = new Map();
  approvedFiles = new Map();
  measured = new Map();
  draftDirty = false;
  deliveryDirty = false;
  draftMessage = '';
  clientMessage = '';
  byId('newFile').value = '';
  drawDraft();
  drawReceived();
  busy = true;
  draw();
  try {
    publisher ??= await newPublisher();
    await publish();
    if (release) {
      receive();
      await verify();
    }
  } catch {
    phase = 'blocked';
    reason = 'failure';
    busy = false;
    draw();
  }
}

function activate(name, focus = false) {
  activeTab = name;
  for (const tab of tabs) {
    const current = tab.dataset.tab === name;
    tab.setAttribute('aria-selected', String(current));
    tab.tabIndex = current ? 0 : -1;
    byId(tab.getAttribute('aria-controls')).hidden = !current;
    if (current && focus) tab.focus();
  }
  syncContext();
}

function applyLanguage() {
  const w = words();
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  const language = byId('language');
  language.textContent = lang === 'zh' ? 'EN' : '中文';
  language.lang = lang === 'zh' ? 'en' : 'zh-CN';
  language.setAttribute('aria-label', lang === 'zh' ? 'Switch to English' : '切换到中文');
  document.querySelectorAll('[data-copy]').forEach((node) => { node.textContent = w[node.dataset.copy]; });
  byId('tabs').setAttribute('aria-label', w.tabs);
  byId('newFile').placeholder = w.placeholder;
  byId('newFile').setAttribute('aria-label', w.filename);
  drawDraft();
  drawReceived();
  activate(activeTab);
  draw();
}

draftFile.addEventListener('change', () => {
  fillEditor(sourceText, draft.get(draftFile.value));
  draw();
});
receivedFile.addEventListener('change', () => {
  clipboardMessage = '';
  drawReceived();
  draw();
});
sourceText.addEventListener('input', () => {
  draft.set(draftFile.value, textBytes(sourceText.value));
  draftDirty = true;
  draftMessage = '';
  draw();
});
receivedText.addEventListener('input', () => {
  delivered.set(receivedFile.value, textBytes(receivedText.value));
  measured.delete(receivedFile.value);
  deliveryDirty = true;
  clientMessage = '';
  invalidate();
  draw();
});
signedField.addEventListener('input', () => {
  const entry = receivedManifest.files.find(({ id }) => id === receivedFile.value);
  if (!entry) return;
  entry.sha256 = signedField.value;
  deliveryDirty = true;
  invalidate();
  draw();
});
byId('addFile').addEventListener('click', () => {
  const input = byId('newFile');
  const id = input.value.trim();
  if (!nameValid(id) || draft.has(id)) {
    draftMessage = 'invalidName';
    draw();
    return;
  }
  draft.set(id, textBytes(''));
  input.value = '';
  draftDirty = true;
  draftMessage = '';
  drawDraft(id);
  sourceText.focus();
  draw();
});
byId('removeDraft').addEventListener('click', () => {
  draft.delete(draftFile.value);
  draftDirty = true;
  draftMessage = '';
  drawDraft();
  draw();
});
byId('removeReceived').addEventListener('click', () => {
  delivered.delete(receivedFile.value);
  measured.delete(receivedFile.value);
  deliveryDirty = true;
  invalidate();
  drawReceived();
  draw();
});
byId('sourceInput').addEventListener('change', () => importFiles(byId('sourceInput'), true));
byId('receivedInput').addEventListener('change', () => importFiles(byId('receivedInput'), false));
byId('importSource').addEventListener('click', () => byId('sourceInput').click());
byId('importReceived').addEventListener('click', () => byId('receivedInput').click());
byId('publish').addEventListener('click', publish);
byId('receive').addEventListener('click', receive);
byId('run').addEventListener('click', verify);
byId('reset').addEventListener('click', reset);
byId('copyHash').addEventListener('click', async () => {
  const value = actualField.value;
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    if (value !== actualField.value) return;
    clipboardMessage = 'copied';
  } catch {
    if (value !== actualField.value) return;
    actualField.focus();
    actualField.select();
    clipboardMessage = 'selected';
  }
  byId('copyStatus').textContent = words()[clipboardMessage];
});
byId('language').addEventListener('click', () => {
  lang = lang === 'zh' ? 'en' : 'zh';
  applyLanguage();
});
for (const [index, tab] of tabs.entries()) {
  tab.addEventListener('click', () => activate(tab.dataset.tab));
  tab.addEventListener('keydown', (event) => {
    const target = { ArrowLeft: (index + tabs.length - 1) % tabs.length,
      ArrowRight: (index + 1) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    activate(tabs[target].dataset.tab, true);
  });
}

applyLanguage();
void reset();
