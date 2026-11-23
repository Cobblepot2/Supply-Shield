const responseAssets = ['passwords', 'sessions', 'ssh', 'api'];
const responsePresets = {
  user: ['passwords', 'sessions'],
  engineer: ['passwords', 'sessions', 'ssh', 'api'],
};

function responseCount(value) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function buildResponsePlan({ report, network, consensus, execution, assets = [] }) {
  const releaseChecked = typeof report?.allowed === 'boolean';
  const releaseBlocked = report?.allowed === false;
  const differences = Array.isArray(report?.rows)
    ? report.rows.filter((row) => ['changed', 'missing', 'extra'].includes(row?.state)).length : 0;
  const networkAlerts = responseCount(network?.alerts);
  const anomalousNodes = responseCount(consensus?.anomalous);
  const observed = releaseBlocked || differences > 0 || networkAlerts > 0 || anomalousNodes > 0;
  const simulatedExecution = execution === 'ran';
  const level = simulatedExecution ? 'assumed' : observed ? 'signals' : releaseChecked ? 'checked' : 'pending';
  const actions = [];
  const add = (id, priority, cleanDevice = false) => actions.push({ id, priority, cleanDevice });

  if (observed || simulatedExecution) {
    add('hold', 1);
    add('evidence', 1);
  } else {
    add('confirm', 1);
  }
  if (simulatedExecution) {
    if (assets.includes('passwords')) add('passwords', 2, true);
    if (assets.includes('sessions')) add('sessions', 2, true);
    if (assets.includes('ssh')) add('ssh', 2, true);
    if (assets.includes('api')) add('api', 2, true);
  }
  if (networkAlerts) add('network', 2);
  if (anomalousNodes) add('nodes', 2);
  if (observed || simulatedExecution) add('restore', 3);

  return {
    evidence: { releaseChecked, releaseBlocked, differences, networkAlerts, anomalousNodes, simulatedExecution },
    level, actions,
    canQuarantine: observed || simulatedExecution,
  };
}

export const createResponse = (() => {
  const copy = {
    zh: {
      eyebrow: '处置工作台 / 模拟', title: '应急响应与恢复',
      lead: '综合校验、连接审计与分发节点的线索，生成与演练资产相符的处置清单。',
      role: '演练角色', user: '普通终端用户', engineer: '开发与运维人员', custom: '自定义资产',
      assetLabel: '演练涉及的资产类别', passwords: '账号密码', sessions: '网页登录会话', ssh: 'SSH 密钥', api: 'API 令牌',
      stage: '演练执行状态', staged: '未假设执行', ran: '假设异常更新已运行',
      stageNote: '选择「假设异常更新已运行」可演示凭据排查。资产选项仅描述演练范围。',
      evidenceLabel: '证据等级', pending: '等待文件校验结果', checked: '本轮未见异常',
      signals: '有异常线索，需排查', assumed: '演练假设 · 样本已运行',
      pendingHint: '运行文件校验，或通过其他模块添加一条异常线索。',
      checkedHint: '当前演练中已收到的结果没有触发异常。',
      signalsHint: '文件差异、白名单外连接和节点偏差只能用于排查，不能单独证明已执行或泄露。',
      assumedHint: '凭据处置按所选演练范围生成，没有确认任何真实凭据受到影响。',
      evidenceItems: (files, links, nodes) => [
        ['文件差异', String(files)], ['连接告警', String(links)], ['异常节点', String(nodes)],
      ],
      blocked: '本轮校验未放行', held: '已标记为隔离（模拟）',
      quarantine: '模拟隔离', quarantineDone: '已模拟隔离', quarantineHint: '隔离仅记录在演练报告中。',
      priority: ['', '立即', '尽快', '恢复'],
      safeDevice: '可信设备', checklist: '处置清单', progress: (n, all) => '已完成 ' + n + ' / ' + all,
      export: '下载报告', print: '打印 / 保存 PDF', reportTitle: '软件分发演练 · 应急响应报告',
      detailsTitle: '演练证据明细', fileEvidence: '文件校验', requestEvidence: '当前版本请求', nodeEvidence: '分发节点',
      fileStates: { match: '一致', changed: '内容不同', missing: '缺失', extra: '未登记' },
      allowedHost: '允许', blockedHost: '白名单外', checkedVersion: '验证版本', majority: '多数哈希占比',
      done: '已完成', todo: '待完成', profileLine: '角色', assetsLine: '演练资产', scoreLine: '证据等级',
      isolatedLine: '模拟隔离', yes: '是', no: '否', exported: '报告已生成。',
      details: {
        hold: ['暂停演练中的更新安装', '把本轮样本标记为隔离，等待复核。此操作只改变演练状态。'],
        evidence: ['保留校验结果与审计线索', '保留差异计数、审计记录和节点汇总，记录发现异常的时间。'],
        confirm: ['核对演练发布基线', '确认参考版本由可信发布渠道提供，完成文件校验后再继续。'],
        passwords: ['复核涉及的账号密码', '若核实密码暴露，从可信设备优先处理邮箱及账号恢复渠道，再改受影响的工作和日常服务密码。'],
        sessions: ['吊销受影响的网页登录会话', '若核实会话暴露，从可信设备退出对应服务的活跃会话，并复核近期登录记录。'],
        ssh: ['轮换演练范围内的 SSH 密钥', '若核实私钥暴露，通知系统管理员，在相关系统撤销旧公钥，并通过可信设备换用新密钥。'],
        api: ['撤销并轮换受影响的 API 令牌', '若核实令牌暴露，请维护者撤销旧令牌、发放最小权限的新令牌，并复核相应访问日志。'],
        network: ['复核白名单外的连接记录', '核对发起连接的模拟进程、目的域名和时间。若有可信业务用途，先复核白名单配置。'],
        nodes: ['复核异常分发节点', '按相同版本对照不同节点的哈希，用可信发布基线核实差异。'],
        restore: ['用已验证的发布版本恢复', '从可信发布渠道重新取得文件，通过完整性校验后再恢复演练中的安装。'],
      },
    },
    en: {
      eyebrow: 'RESPONSE WORKBENCH / SIMULATION', title: 'Incident response and recovery',
      lead: 'Turn verification, connection and node evidence into a checklist for the rehearsal.',
      role: 'Rehearsal role', user: 'General user', engineer: 'Developer or operator', custom: 'Custom assets',
      assetLabel: 'Rehearsal asset categories', passwords: 'Account passwords', sessions: 'Web sessions', ssh: 'SSH keys', api: 'API tokens',
      stage: 'Execution in this rehearsal', staged: 'Execution not assumed', ran: 'Assume the update ran',
      stageNote: 'Assume execution to rehearse credential checks. Asset categories define the exercise scope.',
      evidenceLabel: 'EVIDENCE LEVEL', pending: 'Awaiting verification', checked: 'No signals in this run',
      signals: 'Anomaly signals to review', assumed: 'Rehearsal assumes execution',
      pendingHint: 'Run verification or add a signal through one of the other modules.',
      checkedHint: 'The results received in this rehearsal have raised no signals.',
      signalsHint: 'File differences, unlisted connections and node variation warrant review. They do not establish execution or exposure.',
      assumedHint: 'Credential actions follow the selected exercise scope. No real credential exposure has been confirmed.',
      evidenceItems: (files, links, nodes) => [
        ['File differences', String(files)], ['Connection alerts', String(links)], ['Anomalous nodes', String(nodes)],
      ],
      blocked: 'Verification blocked the simulated release', held: 'Marked quarantined in the simulation',
      quarantine: 'Simulate quarantine', quarantineDone: 'Simulated quarantine recorded',
      quarantineHint: 'Quarantine is recorded in this rehearsal only.',
      priority: ['', 'Immediate', 'Promptly', 'Recovery'],
      safeDevice: 'Trusted device', checklist: 'Response checklist', progress: (n, all) => n + ' / ' + all + ' completed',
      export: 'Download report', print: 'Print / Save PDF', reportTitle: 'Software delivery rehearsal · Response report',
      detailsTitle: 'Exercise evidence', fileEvidence: 'File verification', requestEvidence: 'Current release requests', nodeEvidence: 'Distribution nodes',
      fileStates: { match: 'Match', changed: 'Different', missing: 'Missing', extra: 'Unlisted' },
      allowedHost: 'Allowed', blockedHost: 'Outside allowlist', checkedVersion: 'Verified release', majority: 'Majority share',
      done: 'Done', todo: 'Open', profileLine: 'Role', assetsLine: 'Rehearsal assets', scoreLine: 'Evidence level',
      isolatedLine: 'Simulated quarantine', yes: 'Yes', no: 'No', exported: 'Report generated.',
      details: {
        hold: ['Pause installation in this rehearsal', 'Mark the exercise sample quarantined pending review. This changes only the rehearsal state.'],
        evidence: ['Preserve validation and audit evidence', 'Keep the difference counts, audit records, node summary and the time of detection.'],
        confirm: ['Check the release baseline', 'Confirm the reference version came from a trusted release channel and verify the files before proceeding.'],
        passwords: ['Review potentially affected account passwords', 'If exposure is verified, use a trusted device. Start with email and recovery channels, then change passwords for other affected accounts.'],
        sessions: ['Revoke affected web sessions', 'If exposure is verified, use a trusted device to end the affected active sessions and review recent sign-ins.'],
        ssh: ['Rotate in-scope SSH keys', 'If a private key was exposed, coordinate removal of its old public key with system owners and set up a replacement from a trusted device.'],
        api: ['Revoke and rotate affected API tokens', 'If exposure is verified, ask the owner to revoke old tokens, issue least-privilege replacements and review the relevant access records.'],
        network: ['Review connections outside the allowlist', 'Check the simulated process, destination and time. Verify the allowlist before treating the request as unauthorized.'],
        nodes: ['Review the anomalous distribution nodes', 'Compare hashes for the same version across nodes and verify against the trusted release baseline.'],
        restore: ['Recover with an approved release', 'Retrieve the release through a trusted channel and verify it before resuming installation in the rehearsal.'],
      },
    },
  };

  const labels = (lang) => copy[lang] ?? copy.zh;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function makeSelect(title, options, value, onChange) {
    const label = element('label', 'ss-response-select');
    const select = element('select');
    select.setAttribute('aria-label', title);
    label.append(element('span', '', title), select);
    for (const [key, text] of options) {
      const option = element('option', '', text);
      option.value = key;
      select.append(option);
    }
    select.value = value;
    select.addEventListener('change', () => onChange(select.value));
    return label;
  }

  return function createResponse(container) {
    let context = { lang: 'zh', report: null, network: null, consensus: null };
    let role = 'user';
    let execution = 'staged';
    let assets = new Set(responsePresets.user);
    let completed = new Set();
    let quarantined = false;
    let exportMessage = '';
    let lastIncident = null;

    const root = element('section', 'ss-response');
    root.setAttribute('data-response-module', '');
    container.replaceChildren(root);
    const plan = () => buildResponsePlan({ ...context, execution, assets: [...assets] });

    function getSummary() {
      const { evidence, level, actions } = plan();
      return {
        simulation: true, role, assets: [...assets], evidenceLevel: level, evidence,
        simulatedQuarantine: quarantined, actions: actions.map((action) => ({ ...action, complete: completed.has(action.id) })),
      };
    }

    function printableText() {
      const ui = labels(context.lang);
      const summary = getSummary();
      const { differences, networkAlerts, anomalousNodes } = summary.evidence;
      const evidenceItems = ui.evidenceItems(differences, networkAlerts, anomalousNodes);
      const intro = [
        ui.reportTitle,
        new Date().toISOString(),
        '',
        ui.profileLine + ' · ' + ui[role],
        ui.assetsLine + ' · ' + ([...assets].map((asset) => ui[asset]).join(', ') || '—'),
        ui.stage + ' · ' + ui[execution],
        ui.scoreLine + ' · ' + ui[summary.evidenceLevel],
        ui[summary.evidenceLevel + 'Hint'],
        ...evidenceItems.map(([title, value]) => title + ' · ' + value),
        ...(summary.evidence.releaseBlocked ? [ui.blocked] : []),
        ui.isolatedLine + ' · ' + (quarantined ? ui.yes : ui.no),
        '',
        ui.checklist,
        '',
      ];
      const items = summary.actions.flatMap((action) => {
        const [title, detail] = ui.details[action.id];
        return [
          (action.complete ? '[x] ' : '[ ] ') + ui.priority[action.priority] + ' · ' + title,
          (action.cleanDevice ? ui.safeDevice + ' · ' : '') + detail,
          '',
        ];
      });
      const verification = context.report;
      const requests = context.network?.currentEvidence ?? [];
      const nodes = context.consensus;
      const evidence = [
        ...(verification ? [
          ui.fileEvidence + ' · ' + ui.checkedVersion + ' v' + verification.version,
          ...verification.rows.map(({ id, state, expected, actual }) =>
            id + ' · ' + ui.fileStates[state] + ' · ' + (expected ?? '—') + ' → ' + (actual ?? '—')),
          '',
        ] : []),
        ...(requests.length ? [
          ui.requestEvidence,
          ...requests.map(({ at, filename, host, allowed }) =>
            at + ' · ' + (filename ?? '—') + ' · ' + host + ' · ' + (allowed ? ui.allowedHost : ui.blockedHost)),
          '',
        ] : []),
        ...(nodes ? [ui.nodeEvidence + ' · ' + ui.majority + ' ' +
          Math.round(nodes.consensusRatio * 100) + '% · ' + nodes.normal + ' / ' + nodes.nodeCount] : []),
      ];
      return [...intro, ...items, ...(evidence.length ? [ui.detailsTitle, '', ...evidence] : [])].join('\n');
    }

    function download() {
      const data = new Blob([printableText()], { type: 'text/plain;charset=utf-8' });
      const href = URL.createObjectURL(data);
      const link = element('a');
      link.href = href;
      link.download = 'supply-shield-response.txt';
      link.click();
      setTimeout(() => URL.revokeObjectURL(href), 3000);
      exportMessage = 'exported';
      const status = root.querySelector('.ss-response-export-status');
      if (status) status.textContent = labels(context.lang)[exportMessage];
    }

    function print() {
      document.querySelector('.ss-response-print')?.remove();
      const sheet = element('pre', 'ss-response-print', printableText());
      document.body.append(sheet);
      window.addEventListener('afterprint', () => sheet.remove(), { once: true });
      window.print();
    }

    function render() {
      const t = labels(context.lang);
      const { canQuarantine, level, evidence, actions } = plan();
      const open = new Set([...root.querySelectorAll('details[open]')].map((detail) => detail.dataset.action));
      const title = element('div', 'ss-response-heading');
      const titleText = element('div');
      titleText.append(element('div', 'ss-response-eyebrow', t.eyebrow), element('h3', '', t.title),
        element('p', 'ss-response-muted', t.lead));
      const tools = element('div', 'ss-response-buttons');
      const downloadButton = element('button', 'plain', t.export);
      const printButton = element('button', 'plain', t.print);
      downloadButton.type = printButton.type = 'button';
      downloadButton.addEventListener('click', download);
      printButton.addEventListener('click', print);
      tools.append(downloadButton, printButton);
      title.append(titleText, tools);

      const setup = element('div', 'ss-response-setup');
      const roleField = makeSelect(t.role, [['user', t.user], ['engineer', t.engineer], ['custom', t.custom]], role, (value) => {
        role = value;
        if (responsePresets[role]) assets = new Set(responsePresets[role]);
        render();
        root.querySelector('.ss-response-select select')?.focus();
      });
      const stageField = makeSelect(t.stage, [['staged', t.staged], ['ran', t.ran]], execution, (value) => {
        execution = value;
        render();
        root.querySelectorAll('.ss-response-select select')[1]?.focus();
      });
      const options = element('div', 'ss-response-options');
      options.append(roleField, stageField);
      const assetField = element('fieldset', 'ss-response-assets');
      assetField.append(element('legend', '', t.assetLabel));
      for (const asset of responseAssets) {
        const label = element('label', 'ss-response-asset');
        const input = element('input');
        input.type = 'checkbox';
        input.dataset.asset = asset;
        input.checked = assets.has(asset);
        input.addEventListener('change', () => {
          role = 'custom';
          if (input.checked) assets.add(asset);
          else assets.delete(asset);
          render();
          root.querySelector('[data-asset="' + asset + '"]')?.focus();
        });
        label.append(input, element('span', '', t[asset]));
        assetField.append(label);
      }
      setup.append(options, assetField, element('p', 'ss-response-muted', t.stageNote));

      const card = element('div', 'ss-response-evidence');
      card.dataset.level = level;
      const evidenceHeading = element('div');
      evidenceHeading.append(element('div', 'ss-response-eyebrow', t.evidenceLabel),
        element('strong', 'ss-response-level', t[level]));
      const evidenceText = element('p', 'ss-response-muted', t[level + 'Hint']);
      const stats = element('dl', 'ss-response-stats');
      for (const [label, value] of t.evidenceItems(evidence.differences, evidence.networkAlerts, evidence.anomalousNodes)) {
        const stat = element('div');
        stat.append(element('dt', '', label), element('dd', '', value));
        stats.append(stat);
      }
      const isolate = element('button', 'primary', quarantined ? t.quarantineDone : t.quarantine);
      isolate.type = 'button';
      isolate.disabled = !canQuarantine || quarantined;
      isolate.addEventListener('click', () => {
        quarantined = true;
        completed.add('hold');
        render();
        root.querySelector('.ss-response-isolation [role="status"]')?.focus();
      });
      const isolateHint = element('span', 'ss-response-muted', quarantined ? t.held : t.quarantineHint);
      isolateHint.setAttribute('role', 'status');
      isolateHint.tabIndex = -1;
      const isolation = element('div', 'ss-response-isolation');
      isolation.append(isolate, isolateHint);
      card.append(evidenceHeading, evidenceText, stats);
      if (evidence.releaseBlocked) card.append(element('p', 'ss-response-blocked', t.blocked));
      card.append(isolation);
      const row = element('div', 'ss-response-row');
      row.append(setup, card);

      const checklist = element('div', 'ss-response-checklist');
      const listHead = element('div', 'ss-response-heading');
      const indicator = element('span', 'ss-response-count');
      indicator.setAttribute('aria-live', 'polite');
      const progress = element('progress', 'ss-response-progress');
      progress.max = Math.max(actions.length, 1);
      progress.setAttribute('aria-label', t.checklist);
      function refreshProgress() {
        const done = actions.filter(({ id }) => completed.has(id)).length;
        indicator.textContent = t.progress(done, actions.length);
        progress.value = done;
        progress.textContent = indicator.textContent;
      }
      refreshProgress();
      listHead.append(element('h4', '', t.checklist), indicator);
      const list = element('ol', 'ss-response-action-list');
      for (const action of actions) {
        const [name, detail] = t.details[action.id];
        const item = element('li', 'ss-response-action');
        item.dataset.priority = String(action.priority);
        const label = element('label', 'ss-response-action-label');
        const check = element('input');
        check.type = 'checkbox';
        check.checked = completed.has(action.id);
        check.disabled = action.id === 'hold' && quarantined;
        item.dataset.done = String(check.checked);
        check.addEventListener('change', () => {
          if (check.checked) completed.add(action.id);
          else completed.delete(action.id);
          item.dataset.done = String(check.checked);
          refreshProgress();
        });
        label.append(check, element('span', '', name));
        const explanation = element('details', 'ss-response-action-details');
        explanation.dataset.action = action.id;
        explanation.open = open.has(action.id);
        const badge = element('summary', 'ss-response-priority', t.priority[action.priority]);
        badge.setAttribute('aria-label', name + ' · ' + t.priority[action.priority]);
        explanation.append(badge, element('p', 'ss-response-muted', (action.cleanDevice ? t.safeDevice + ' · ' : '') + detail));
        item.append(label, explanation);
        list.append(item);
      }
      checklist.append(listHead, progress, list);
      const reportStatus = element('p', 'ss-response-export-status', t[exportMessage] ?? '');
      reportStatus.setAttribute('role', 'status');
      root.replaceChildren(title, row, checklist, reportStatus);
    }

    function update(next) {
      const oldLanguage = context.lang;
      const newContext = { ...context, ...next };
      const key = JSON.stringify([
        newContext.report?.allowed ?? null,
        newContext.report?.rows?.filter((row) => row.state !== 'match').map(({ state, expected, actual, id }) => [state, expected, actual, id]) ?? [],
        newContext.network?.alerts ?? 0, newContext.consensus?.anomalous ?? 0,
      ]);
      context = newContext;
      if (lastIncident !== key) {
        if (lastIncident !== null) {
          completed = new Set();
          quarantined = false;
          exportMessage = '';
        }
        lastIncident = key;
      } else if (oldLanguage === context.lang) return;
      render();
    }

    function reset() {
      context = { lang: context.lang, report: null, network: null, consensus: null };
      role = 'user';
      execution = 'staged';
      assets = new Set(responsePresets.user);
      completed = new Set();
      quarantined = false;
      exportMessage = '';
      lastIncident = null;
      render();
    }

    render();
    return { update, reset, getSummary };
  };
})();
