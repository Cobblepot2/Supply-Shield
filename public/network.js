const defaults = ['update.example', 'assets.example'];
const evidenceLimit = 100;

const networkCopy = {
  zh: {
    eyebrow: '出站策略',
    heading: '监看模拟进程的出站请求',
    intro: '先确认可访问的主机，再输入模拟进程尝试连接的目的地。每条请求立即按生效规则判断。',
    policy: '01 / 配置允许访问的主机',
    policyLabel: '允许访问的域名',
    policyHint: '每行一个域名。按主机名精确匹配，子域名需单独添加。',
    apply: '应用白名单',
    notApplied: '先应用白名单，再模拟连接。',
    applied: (count) => '已应用 ' + count + ' 个主机规则。',
    rejectAll: '空白名单已生效。模拟连接都会触发告警。',
    invalidPolicy: '清单中有未识别的主机。请输入有效的域名或 HTTP(S) 地址。',
    policyLimit: '最多设置 64 条白名单规则。',
    connection: '02 / 模拟进程出站连接',
    process: '当前模拟进程',
    defaultProcess: '更新进程',
    destination: '目的地主机',
    destinationHint: '可输入域名或 HTTP(S) 地址。判定只使用主机名。',
    placeholder: '例如 update.example',
    run: '记录模拟连接',
    fillAllowed: '填入允许的目标',
    fillOther: '填入未列出的目标',
    invalidDestination: '请输入有效的域名或 HTTP(S) 地址。',
    denied: (host) => host + ' 不在白名单，触发出站告警。',
    allowed: (host) => host + ' 已通过主机白名单检查。',
    logs: '模拟连接日志',
    clear: '清空日志',
    attempts: '记录数',
    alerts: '告警数',
    scopedAlerts: (version, count) => 'v' + version + ' · 当前版本告警 ' + count,
    unscoped: '当前未绑定发布版本',
    empty: '应用白名单后，输入一个目的地来观察判定。',
    time: '时间',
    file: '模拟进程来源',
    version: '发布版本',
    unassigned: '未绑定',
    host: '目的地主机',
    decision: '判定',
    permission: '允许',
    warning: '告警',
    disclaimer: '请求是演练输入。网页只计算白名单规则，不实际建立连接。域名告警是排查线索，不能单独证明进程已受攻击。',
    active: '生效主机',
    none: '已启用拒绝所有主机的规则',
  },
  en: {
    eyebrow: 'Outbound policy',
    heading: 'Audit simulated outbound requests',
    intro: 'Choose the hosts the process may contact, then enter an attempted destination to see how the active policy treats it.',
    policy: '01 / Configure allowed hosts',
    policyLabel: 'Allowed hostnames',
    policyHint: 'One hostname per line. Names match exactly. Add subdomains separately.',
    apply: 'Apply allowlist',
    notApplied: 'Apply an allowlist before simulating a connection.',
    applied: (count) => count + ' host rules applied.',
    rejectAll: 'An empty allowlist is active. Every simulated destination will trigger an alert.',
    invalidPolicy: 'The list contains an invalid host. Enter hostnames or valid HTTP(S) addresses.',
    policyLimit: 'The allowlist can contain up to 64 host rules.',
    connection: '02 / Simulate an outbound request',
    process: 'Current simulated process',
    defaultProcess: 'Updater process',
    destination: 'Destination host',
    destinationHint: 'Enter a hostname or HTTP(S) address. The rule uses only the hostname.',
    placeholder: 'For example, update.example',
    run: 'Record simulated request',
    fillAllowed: 'Use an allowed host',
    fillOther: 'Use an unlisted host',
    invalidDestination: 'Enter a valid hostname or HTTP(S) address.',
    denied: (host) => host + ' is outside the allowlist and triggered an alert.',
    allowed: (host) => host + ' passed the host allowlist check.',
    logs: 'Simulated connection log',
    clear: 'Clear log',
    attempts: 'Entries',
    alerts: 'Alerts',
    scopedAlerts: (version, count) => 'v' + version + ' · ' + count + ' alerts for this release',
    unscoped: 'No release assigned',
    empty: 'Apply an allowlist and enter a destination to see a decision.',
    time: 'Time',
    file: 'Simulated process source',
    version: 'Release version',
    unassigned: 'Unassigned',
    host: 'Destination host',
    decision: 'Decision',
    permission: 'Allowed',
    warning: 'Alert',
    disclaimer: 'Requests are exercise inputs. The browser applies the allowlist without opening connections. A host alert is evidence to investigate and cannot establish compromise by itself.',
    active: 'Active hosts',
    none: 'Deny-all policy enabled',
  },
};

export function normalizeAuditHost(value) {
  const text = value.trim();
  if (!text || text.length > 2048 || /[\s\\]/u.test(text)) throw new Error('invalidHost');

  const schemeMatch = text.match(/^[a-z][a-z\d+.-]*:\/\//i);
  const authority = text.slice(schemeMatch?.[0].length ?? 0).split(/[/?#]/u, 1)[0];
  if (!authority || /[@%]/u.test(authority)) throw new Error('invalidHost');

  const address = new URL(schemeMatch ? text : 'https://' + text);
  const host = address.hostname.toLowerCase().replace(/\.$/, '');
  const labels = host.split('.');
  if (!['http:', 'https:'].includes(address.protocol) || host.length > 253 || labels.length < 2 ||
      labels.some((label) => !/^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label))) {
    throw new Error('invalidHost');
  }
  return host;
}

export function parseAuditAllowlist(value) {
  const entries = value.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  if (entries.length > 64) throw new Error('policyLimit');
  return [...new Set(entries.map(normalizeAuditHost))];
}

export function inspectAuditDestination(allowlist, target) {
  const host = normalizeAuditHost(target);
  return { host, allowed: allowlist.includes(host) };
}

export function createNetwork(container, { onChange = () => {} } = {}) {
  const doc = container.ownerDocument;
  let lang = 'zh';
  let filename = null;
  let releaseVersion = null;
  let allowlist = null;
  let evidence = [];
  let policyRevision = 0;
  let policyMessage = 'notApplied';
  let connectionMessage = null;

  function element(tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  const labels = [];
  function word(tag, key, className) {
    const node = element(tag, className);
    labels.push([node, key]);
    return node;
  }
  function button(key, className, type = 'button') {
    const node = word('button', key, className);
    node.type = type;
    return node;
  }

  const root = element('section', 'network-audit');
  const header = element('div', 'network-heading');
  header.append(word('p', 'eyebrow', 'label'), word('h3', 'heading'), word('p', 'intro', 'hint'));
  const configuration = element('div', 'network-forms');

  const policyForm = element('form', 'network-form');
  const policyLabel = word('label', 'policyLabel');
  policyLabel.htmlFor = 'network-policy-input';
  const policy = element('textarea');
  policy.id = policyLabel.htmlFor;
  policy.spellcheck = false;
  policy.autocapitalize = 'none';
  policy.maxLength = 8192;
  policy.rows = 3;
  policy.value = defaults.join('\n');
  const policyHint = word('p', 'policyHint', 'hint');
  policyHint.id = 'network-policy-hint';
  policy.setAttribute('aria-describedby', policyHint.id);
  const policyFeedback = element('p', 'network-feedback');
  policyFeedback.setAttribute('role', 'status');
  const policyActive = element('p', 'network-active');
  policyForm.append(word('h4', 'policy'), policyLabel, policy, policyHint, button('apply', 'plain', 'submit'),
    policyFeedback, policyActive);

  const connectionForm = element('form', 'network-form');
  const process = element('p', 'network-process');
  const destinationLabel = word('label', 'destination');
  destinationLabel.htmlFor = 'network-destination-input';
  const destination = element('input');
  destination.id = destinationLabel.htmlFor;
  destination.type = 'text';
  destination.maxLength = 2048;
  destination.autocomplete = 'off';
  destination.spellcheck = false;
  destination.autocapitalize = 'none';
  const destinationHint = word('p', 'destinationHint', 'hint');
  destinationHint.id = 'network-destination-hint';
  destination.setAttribute('aria-describedby', destinationHint.id);
  const connectionFeedback = element('p', 'network-feedback');
  connectionFeedback.setAttribute('role', 'status');
  const actions = element('div', 'network-actions');
  const run = button('run', 'primary', 'submit');
  const fillAllowed = button('fillAllowed', 'plain');
  const fillOther = button('fillOther', 'plain');
  actions.append(run, fillAllowed, fillOther);
  connectionForm.append(word('h4', 'connection'), process, destinationLabel, destination, destinationHint, actions,
    connectionFeedback);
  configuration.append(policyForm, connectionForm);

  const logHeader = element('div', 'network-table-head');
  const counts = element('span', 'network-counts');
  const clear = button('clear', 'plain');
  logHeader.append(word('h4', 'logs'), counts, clear);
  const log = element('div');
  root.append(header, configuration, logHeader, log, word('p', 'disclaimer', 'hint network-note'));
  container.replaceChildren(root);

  function getSummary() {
    const currentEvidence = releaseVersion === null ? [] : evidence.filter((entry) => entry.releaseVersion === releaseVersion);
    return {
      configured: allowlist !== null,
      allowlist: [...(allowlist ?? [])],
      releaseVersion,
      alerts: evidence.filter(({ allowed }) => !allowed).length,
      evidence: evidence.map((entry) => ({ ...entry })),
      currentAlerts: currentEvidence.filter(({ allowed }) => !allowed).length,
      currentEvidence: currentEvidence.map((entry) => ({ ...entry })),
    };
  }

  function render() {
    const text = networkCopy[lang];
    const summary = getSummary();
    for (const [node, key] of labels) node.textContent = text[key];
    destination.placeholder = text.placeholder;
    const scope = releaseVersion === null ? text.unscoped : text.scopedAlerts(releaseVersion, summary.currentAlerts);
    process.textContent = text.process + ' · ' + (filename || text.defaultProcess) + ' · ' + scope;
    policyFeedback.textContent = policyMessage === 'applied' ? text.applied(allowlist.length) : text[policyMessage];
    policyFeedback.classList.toggle('bad', ['invalidPolicy', 'policyLimit'].includes(policyMessage));
    policyActive.textContent = !summary.configured ? '' : summary.allowlist.length
      ? text.active + ' · ' + summary.allowlist.join(', ')
      : text.none;
    run.disabled = !summary.configured;
    fillAllowed.disabled = !summary.allowlist.length;
    fillOther.disabled = !summary.configured;
    connectionFeedback.textContent = connectionMessage?.host
      ? text[connectionMessage.key](connectionMessage.host)
      : text[connectionMessage?.key] ?? '';
    connectionFeedback.classList.toggle('bad', ['denied', 'invalidDestination'].includes(connectionMessage?.key));
    connectionFeedback.classList.toggle('good', connectionMessage?.key === 'allowed');
    counts.textContent = text.attempts + ' ' + evidence.length + ' · ' + text.alerts + ' ' + summary.alerts;
    clear.disabled = !evidence.length;

    if (!evidence.length) {
      log.replaceChildren(element('p', 'hint network-empty', text.empty));
      return;
    }

    const scroll = element('div', 'table-scroll');
    const table = doc.createElement('table');
    const header = table.createTHead().insertRow();
    for (const key of ['time', 'file', 'version', 'host', 'decision']) {
      const cell = element('th', undefined, text[key]);
      cell.scope = 'col';
      header.append(cell);
    }
    const body = table.createTBody();
    const clock = new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    for (const entry of evidence.slice().reverse()) {
      const row = body.insertRow();
      const time = row.insertCell();
      const stamp = element('time', undefined, clock.format(new Date(entry.at)));
      stamp.dateTime = entry.at;
      time.append(stamp);
      row.append(element('td', undefined, entry.filename || text.defaultProcess),
        element('td', 'mono', entry.releaseVersion === null ? text.unassigned : 'v' + entry.releaseVersion),
        element('td', 'mono', entry.host),
        element('td', entry.allowed ? 'good' : 'bad', entry.allowed ? text.permission : text.warning));
    }
    scroll.append(table);
    log.replaceChildren(scroll);
  }

  function changed() {
    render();
    onChange(getSummary());
  }

  policyForm.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      allowlist = parseAuditAllowlist(policy.value);
      policyRevision += 1;
      policyMessage = allowlist.length ? 'applied' : 'rejectAll';
      changed();
    } catch (error) {
      policyMessage = error.message === 'policyLimit' ? 'policyLimit' : 'invalidPolicy';
      render();
    }
  });

  connectionForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (allowlist === null) return;
    try {
      const outcome = inspectAuditDestination(allowlist, destination.value);
      evidence.push({ at: new Date().toISOString(), filename, releaseVersion, ...outcome, policyRevision });
      if (evidence.length > evidenceLimit) evidence.shift();
      connectionMessage = { key: outcome.allowed ? 'allowed' : 'denied', host: outcome.host };
      changed();
    } catch {
      connectionMessage = { key: 'invalidDestination' };
      render();
    }
  });

  fillAllowed.addEventListener('click', () => {
    destination.value = allowlist?.[0] ?? '';
    destination.focus();
  });

  fillOther.addEventListener('click', () => {
    let proposal = 'unlisted.example';
    for (let index = 2; allowlist?.includes(proposal); index += 1) proposal = 'unlisted-' + index + '.example';
    destination.value = proposal;
    destination.focus();
  });

  clear.addEventListener('click', () => {
    evidence = [];
    connectionMessage = null;
    changed();
  });

  render();
  return {
    update(next = {}) {
      if (next.lang === 'zh' || next.lang === 'en') lang = next.lang;
      if (Object.hasOwn(next, 'filename')) filename = next.filename || null;
      if (Object.hasOwn(next, 'releaseVersion')) {
        releaseVersion = Number.isSafeInteger(next.releaseVersion) && next.releaseVersion > 0 ? next.releaseVersion : null;
      }
      render();
    },
    reset() {
      policy.value = defaults.join('\n');
      destination.value = '';
      allowlist = null;
      releaseVersion = null;
      policyRevision = 0;
      evidence = [];
      policyMessage = 'notApplied';
      connectionMessage = null;
      changed();
    },
    getSummary,
  };
}
