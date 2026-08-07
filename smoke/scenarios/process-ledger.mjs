import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { connectCdp, evaluate, screenshot } from '../shared/cdp.mjs';
import { clickNav, selectByLabel, setInputByLabel, waitForText } from '../shared/dom.mjs';
import { createIsolatedDirs, prepareIsolatedSshConfig } from '../shared/isolation.mjs';
import { electronExecutable, root, executable } from '../shared/paths.mjs';
import { createProcessSet } from '../shared/processes.mjs';
import { waitFor } from '../shared/wait.mjs';

const evidenceDir = path.join(root, '.omo', 'evidence', 'phase-5-process-ledger-console', 'final');
const viteUrl = 'http://127.0.0.1:5195';
const cdpPort = 9345;
const rows = [
  { serverId: 'server-twin-a', serverName: 'Twin Node', stale: false, gpuIndex: 0, gpuUuid: 'GPU-twin-a-0000000000000001', pid: 700, parentPid: null, runtimeSeconds: 1800, username: 'alice', command: 'python train.py --batch-size 64', processKind: 'compute', gpuMemoryUsedMiB: 6144, gpuUtilizationPercent: 88, gpuSmUtilizationPercent: 86, gpuMemoryUtilizationPercent: 62, gpuEncoderUtilizationPercent: 0, gpuDecoderUtilizationPercent: 0, cpuPercent: 46, hostMemoryUsedMiB: 8192 },
  { serverId: 'server-twin-a', serverName: 'Twin Node', stale: false, gpuIndex: 1, gpuUuid: 'GPU-twin-a-0000000000000002', pid: 700, parentPid: null, runtimeSeconds: 1800, username: 'alice', command: 'python train.py --batch-size 64', processKind: 'compute', gpuMemoryUsedMiB: 4096, gpuUtilizationPercent: 74, gpuSmUtilizationPercent: 70, gpuMemoryUtilizationPercent: 48, gpuEncoderUtilizationPercent: 0, gpuDecoderUtilizationPercent: 0, cpuPercent: 46, hostMemoryUsedMiB: 8192 },
  { serverId: 'server-twin-b', serverName: 'Twin Node', stale: true, gpuIndex: 0, gpuUuid: 'GPU-twin-b-0000000000000003', pid: 701, parentPid: null, runtimeSeconds: null, username: null, command: null, processKind: 'compute', gpuMemoryUsedMiB: null, gpuUtilizationPercent: null, gpuSmUtilizationPercent: null, gpuMemoryUtilizationPercent: null, gpuEncoderUtilizationPercent: null, gpuDecoderUtilizationPercent: null, cpuPercent: null, hostMemoryUsedMiB: null },
  { serverId: 'server-long-name', serverName: 'Server with an intentionally long process ledger host name for table overflow evidence', stale: false, gpuIndex: 0, gpuUuid: 'GPU-long-uuid-0123456789abcdef-fedcba9876543210-overflow-proof', pid: 9100, parentPid: null, runtimeSeconds: 7265, username: 'very-long-analysis-user-name-that-must-truncate-in-the-table-cell', command: `python ledger_inspector.py --token secret-value ${'x'.repeat(160)} safe-tail-marker /Users/alice/.ssh/id_ed25519`, processKind: 'compute', gpuMemoryUsedMiB: 16384, gpuUtilizationPercent: 96, gpuSmUtilizationPercent: 94, gpuMemoryUtilizationPercent: 91, gpuEncoderUtilizationPercent: 1, gpuDecoderUtilizationPercent: 2, cpuPercent: 92, hostMemoryUsedMiB: 32768 },
  { serverId: 'server-long-name', serverName: 'Server with an intentionally long process ledger host name for table overflow evidence', stale: false, gpuIndex: 0, gpuUuid: 'GPU-long-uuid-0123456789abcdef-fedcba9876543210-overflow-proof', pid: 9101, parentPid: 9100, runtimeSeconds: 120, username: 'very-long-analysis-user-name-that-must-truncate-in-the-table-cell', command: 'python child_worker.py --queue gpu', processKind: 'compute', gpuMemoryUsedMiB: 768, gpuUtilizationPercent: 18, gpuSmUtilizationPercent: 16, gpuMemoryUtilizationPercent: 9, gpuEncoderUtilizationPercent: 0, gpuDecoderUtilizationPercent: 0, cpuPercent: 8, hostMemoryUsedMiB: 2048 },
  { serverId: 'server-render', serverName: 'Render Node', stale: false, gpuIndex: 2, gpuUuid: 'GPU-render-0000000000000004', pid: 802, parentPid: null, runtimeSeconds: 90, username: 'renderer', command: 'blender --background scene.blend', processKind: 'graphics', gpuMemoryUsedMiB: 2048, gpuUtilizationPercent: 35, gpuSmUtilizationPercent: 33, gpuMemoryUtilizationPercent: 25, gpuEncoderUtilizationPercent: 12, gpuDecoderUtilizationPercent: 4, cpuPercent: 17, hostMemoryUsedMiB: 4096 }
];
const servers = [
  { id: 'server-twin-a', name: 'Twin Node', host: 'twin-a.example.test', port: 22, username: 'alice', sshKeyPath: null, pollingIntervalSeconds: 60, enabled: false, configRevision: 1, createdAt: '2026-07-13T00:00:00.000Z', updatedAt: '2026-07-13T00:00:00.000Z' },
  { id: 'server-twin-b', name: 'Twin Node', host: 'twin-b.example.test', port: 22, username: 'bob', sshKeyPath: null, pollingIntervalSeconds: 60, enabled: false, configRevision: 1, createdAt: '2026-07-13T00:00:00.000Z', updatedAt: '2026-07-13T00:00:00.000Z' }
];
const overview = servers.map((server, index) => ({ id: server.id, name: server.name, host: server.host, status: index === 0 ? 'online' : 'stale', gpuTotal: 2, busyGpuCount: 1, freeGpuCount: 1, averageGpuUtilizationPercent: 50, averageMemoryUsagePercent: 50, maxTemperatureCelsius: 65, lastSuccessAt: '2026-07-13T00:00:00.000Z', lastErrorType: null, lastErrorMessage: null }));

const fakeHelperSource = (statePath, helperLogPath) => `#!/usr/bin/env node
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
const rows = ${JSON.stringify(rows)};
const servers = ${JSON.stringify(servers)};
const overview = ${JSON.stringify(overview)};
const statePath = ${JSON.stringify(statePath)};
const helperLogPath = ${JSON.stringify(helperLogPath)};
const request = JSON.parse(readFileSync(0, 'utf8'));
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { phase: 'initial', processCalls: 0 };
let response;
switch (request.action) {
  case 'initialize_app': case 'list_overview': response = { ok: true, data: overview }; break;
  case 'list_servers': response = { ok: true, data: servers }; break;
  case 'list_processes':
    state.processCalls = (state.processCalls ?? 0) + 1;
    response = state.phase === 'refresh-error'
      ? { ok: false, error: { layer: 'storage_app', type: 'backend_unavailable', message: 'Refresh failed for /Users/alice/.ssh/id_ed25519 --token secret-value' } }
      : { ok: true, data: state.phase === 'vanished-options' ? rows.filter((row) => row.serverId !== 'server-twin-a') : state.phase === 'no-processes' ? [] : rows };
    break;
  case 'list_ssh_config_hosts': response = { ok: true, data: { candidates: [], warnings: [] } }; break;
  case 'get_server_detail': response = { ok: true, data: null }; break;
  case 'list_gpu_history': response = { ok: true, data: { serverId: '', serverName: '', pollingIntervalSeconds: 0, range: '1h', startedAt: '2026-07-13T00:00:00.000Z', finishedAt: '2026-07-13T00:00:00.000Z', series: [] } }; break;
  case 'test_connection': case 'refresh_server': response = { ok: true, data: { ok: true, status: 'online', errorType: null, message: null } }; break;
  default: response = { ok: true, data: null };
}
writeFileSync(statePath, JSON.stringify(state));
appendFileSync(helperLogPath, JSON.stringify({ action: request.action, phase: state.phase, processCalls: state.processCalls }) + '\\n');
process.stdout.write(JSON.stringify(response));
`;

const clickSelector = (cdp, selector) => evaluate(cdp, `(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) throw new Error('Missing selector: ' + ${JSON.stringify(selector)}); element.click(); return true; })()`);
const expectPage = (cdp, label, expression) => waitFor(label, async () => (await evaluate(cdp, `Boolean(${expression})`)) ? true : null);
const waitForSmokeText = (cdp, text) => waitForText(cdp, text, { evidenceDir, missingPrefix: 'process-ledger', timeoutMs: 30000 });
const setHelperPhase = (statePath, phase) => writeFile(statePath, JSON.stringify({ phase }));
const showLedgerTable = (cdp) => evaluate(cdp, '(() => { const table = document.querySelector(".process-ledger-table-shell"); if (!table) throw new Error("Missing process ledger table"); table.scrollLeft = 0; table.scrollIntoView({ block: "start" }); return true; })()');

async function setViewport(cdp, width, height) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await expectPage(cdp, `${width}x${height} viewport`, `window.innerWidth === ${width} && window.innerHeight === ${height}`);
}

async function pressKey(cdp, key, modifiers = 0) {
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key === 'Escape' ? 'Escape' : 'Tab', modifiers, windowsVirtualKeyCode: key === 'Escape' ? 27 : 9 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key === 'Escape' ? 'Escape' : 'Tab', modifiers, windowsVirtualKeyCode: key === 'Escape' ? 27 : 9 });
}

async function captureDensityEvidence(cdp, screenshots) {
  await setViewport(cdp, 1024, 720);
  await clickSelector(cdp, 'button[aria-label="Use full display mode"]');
  await showLedgerTable(cdp);
  await screenshot(cdp, evidenceDir, 'process-ledger-1024x720-full.png', (file) => screenshots.push(file));
  await clickSelector(cdp, 'button[aria-label="Use compact display mode"]');
  await expectPage(cdp, 'compact density', 'document.querySelector(".app-shell")?.dataset.density === "compact"');
  await showLedgerTable(cdp);
  await screenshot(cdp, evidenceDir, 'process-ledger-1024x720-compact.png', (file) => screenshots.push(file));
  await setViewport(cdp, 1280, 860);
  await clickSelector(cdp, 'button[aria-label="Use full display mode"]');
  await showLedgerTable(cdp);
  await screenshot(cdp, evidenceDir, 'process-ledger-1280x860-full.png', (file) => screenshots.push(file));
  await clickSelector(cdp, 'button[aria-label="Use compact display mode"]');
  await showLedgerTable(cdp);
  await screenshot(cdp, evidenceDir, 'process-ledger-1280x860-compact.png', (file) => screenshots.push(file));
  await clickSelector(cdp, 'button[aria-label="Use full display mode"]');
}

async function runLedgerInteractions(cdp, screenshots) {
  await clickNav(cdp, 'Process Table');
  await waitForSmokeText(cdp, 'GPU memory ledger');
  await waitForSmokeText(cdp, 'Showing 6 of 6 process rows');
  await expectPage(cdp, 'all twelve sort controls', `document.querySelectorAll('button[aria-label^="Sort "]').length === 12`);
  await expectPage(cdp, 'table-local horizontal overflow', '(() => { const table = document.querySelector(".process-ledger-table-shell"); return table && table.scrollWidth > table.clientWidth && document.documentElement.scrollWidth <= window.innerWidth; })()');
  await expectPage(cdp, 'long table values', `Boolean(document.querySelector('.process-ledger-server-name[title*="intentionally long"]') && document.querySelector('.process-ledger-user-cell[title*="very-long-analysis"]') && document.querySelector('.process-ledger-gpu-uuid[title*="overflow-proof"]'))`);
  await clickSelector(cdp, 'button[aria-label="Sort Process / PID not sorted"]');
  await expectPage(cdp, 'PID ascending sort', `document.querySelector('th[aria-sort="ascending"]')?.textContent?.includes('Process / PID')`);
  await clickSelector(cdp, 'button[aria-label="Sort Process / PID ascending"]');
  await expectPage(cdp, 'PID descending sort', `document.querySelector('th[aria-sort="descending"]')?.textContent?.includes('Process / PID')`);
  await clickSelector(cdp, 'button[aria-label="Sort GPU util not sorted"]');
  await expectPage(cdp, 'GPU utilization sort', `document.querySelector('th[aria-sort="descending"]')?.textContent?.includes('GPU util')`);
  await selectByLabel(cdp, 'View', 'parentGrouped');
  await expectPage(cdp, 'parent grouped rows', 'document.querySelector("#process-view-mode")?.value === "parentGrouped" && document.querySelectorAll("tbody .process-ledger-row").length === 6');
  await selectByLabel(cdp, 'View', 'userGrouped');
  await expectPage(cdp, 'user grouped rows', 'document.querySelector("#process-view-mode")?.value === "userGrouped" && document.querySelectorAll(".process-ledger-group-row").length > 0');
  await selectByLabel(cdp, 'View', 'flat');
  await setInputByLabel(cdp, 'Search', 'no-matching-ledger-term');
  await waitForSmokeText(cdp, 'No processes match filters');
  await clickSelector(cdp, '.process-ledger-filtered-empty button');
  await waitForSmokeText(cdp, 'Showing 6 of 6 process rows');
}

async function runScenario(logs, processSet) {
  await mkdir(evidenceDir, { recursive: true });
  const { tempDataDir, tempHomeDir } = await createIsolatedDirs('gpuwatcher-process-ledger-', 'gpuwatcher-process-ledger-home-');
  await prepareIsolatedSshConfig(tempHomeDir);
  const helperDir = path.join(tempDataDir, 'smoke-helper');
  const helperPath = path.join(helperDir, 'gpuwatcher-process-ledger-helper');
  const helperLogPath = path.join(evidenceDir, 'process-ledger-helper.log');
  const statePath = path.join(helperDir, 'state.json');
  await mkdir(helperDir, { recursive: true });
  await writeFile(helperLogPath, '');
  await writeFile(helperPath, fakeHelperSource(statePath, helperLogPath));
  await chmod(helperPath, 0o755);
  processSet.spawnLogged({ command: executable('vite'), args: ['--host', '127.0.0.1', '--port', '5195', '--strictPort'], cwd: root, env: {}, onOutput: (stream, chunk) => logs.vite.push(`[${stream}] ${chunk}`) });
  await waitFor('Process Ledger Vite server', async () => (await fetch(viteUrl).catch(() => null))?.ok);
  processSet.spawnLogged({ command: electronExecutable(), args: [`--remote-debugging-port=${cdpPort}`, path.join(root, 'dist-electron', 'electron', 'main.js')], cwd: root, env: { ELECTRON_ENABLE_LOGGING: '1', GPUWATCHER_HELPER_PATH: helperPath, GPUWATCHER_TEST_DATA_DIR: tempDataDir, HOME: tempHomeDir, VITE_DEV_SERVER_URL: viteUrl }, onOutput: (stream, chunk) => logs.electron.push(`[${stream}] ${chunk}`) });
  let cdp;
  try {
    cdp = await connectCdp({ port: cdpPort, description: 'Process Ledger Electron CDP page', pagePredicate: (page) => page.type === 'page' && page.webSocketDebuggerUrl && String(page.url).startsWith(viteUrl), timeoutMs: 30000 });
    await waitForSmokeText(cdp, 'GPUWatcher');
    await waitForSmokeText(cdp, 'Fleet snapshot');
    await expectPage(cdp, 'renderer listServers bridge', 'window.gpuwatcher.listServers({}).then((response) => response.ok && response.data.length === 2)');
    const screenshots = [];
    await runLedgerInteractions(cdp, screenshots);
    await setInputByLabel(cdp, 'Search', '');
    await selectByLabel(cdp, 'Server', 'Twin Node::server-twin-a');
    await selectByLabel(cdp, 'GPU', '0::GPU-twin-b-0000000000000003');
    await waitForSmokeText(cdp, 'No processes match filters');
    await clickSelector(cdp, '.process-ledger-filtered-empty button');
    await captureDensityEvidence(cdp, screenshots);
    await clickSelector(cdp, 'tr[aria-label*="PID 9100"]');
    await waitForSmokeText(cdp, 'Read-only view; no process actions are available.');
    await expectPage(cdp, 'sanitized long drawer command', '(() => { const text = document.querySelector("[role=dialog]")?.innerText ?? ""; return text.includes("safe-tail-marker") && text.includes("--token=[redacted]") && text.includes("[path redacted]") && !text.includes("secret-value") && !text.includes("/Users/alice/.ssh/id_ed25519"); })()');
    await clickSelector(cdp, 'tr[aria-label*="PID 700"]');
    await expectPage(cdp, 'modal blocks background row activation', 'document.querySelector("[role=dialog]")?.textContent?.includes("PID 9100")');
    await expectPage(cdp, 'drawer initial focus', 'document.activeElement?.getAttribute("aria-label") === "Close drawer"');
    await pressKey(cdp, 'Tab');
    await expectPage(cdp, 'drawer Tab containment', 'document.activeElement?.getAttribute("aria-label") === "Close drawer"');
    await pressKey(cdp, 'Tab', 8);
    await expectPage(cdp, 'drawer Shift+Tab containment', 'document.activeElement?.getAttribute("aria-label") === "Close drawer"');
    await screenshot(cdp, evidenceDir, 'process-ledger-drawer-modal.png', (file) => screenshots.push(file));
    await pressKey(cdp, 'Escape');
    await expectPage(cdp, 'drawer Escape close and focus return', '!document.querySelector("[role=dialog]") && document.activeElement?.getAttribute("aria-label")?.includes("PID 9100")');
    await clickSelector(cdp, 'tr[aria-label*="PID 9100"]');
    await setInputByLabel(cdp, 'Search', 'twin');
    await expectPage(cdp, 'selected row fallback focus', '!document.querySelector("[role=dialog]") && document.activeElement?.textContent === "GPU memory ledger"');
    await clickSelector(cdp, '.process-ledger-command-secondary > button');
    await setHelperPhase(statePath, 'refresh-error');
    await clickSelector(cdp, 'button[aria-label="Refresh process rows"]');
    await waitForSmokeText(cdp, 'Refresh rows failed');
    await expectPage(cdp, 'cached rows and sanitized refresh error', '(() => { const text = document.body.innerText; return document.querySelectorAll("tbody .process-ledger-row").length === 6 && text.includes("[path redacted]") && text.includes("--token=[redacted]") && !text.includes("secret-value") && !text.includes("/Users/alice/.ssh/id_ed25519"); })()');
    await selectByLabel(cdp, 'Server', 'Twin Node::server-twin-a');
    await selectByLabel(cdp, 'GPU', '0::GPU-twin-a-0000000000000001');
    await setHelperPhase(statePath, 'vanished-options');
    await clickSelector(cdp, 'button[aria-label="Refresh process rows"]');
    await expectPage(cdp, 'vanished server and GPU reset', 'document.querySelector("#process-server-filter")?.value === "all" && document.querySelector("#process-gpu-filter")?.value === "all" && document.body.innerText.includes("Showing 4 of 4 process rows")');
    await setHelperPhase(statePath, 'no-processes');
    await clickSelector(cdp, 'button[aria-label="Refresh process rows"]');
    await waitForSmokeText(cdp, 'No processes');
    await expectPage(cdp, 'no-processes empty state', 'document.body.innerText.includes("No latest successful GPU process rows")');
    const helperLog = await readFile(helperLogPath, 'utf8');
    await writeFile(path.join(evidenceDir, 'process-ledger-smoke-report.md'), `# Process Ledger Electron Smoke\n\n- Vite: ${viteUrl} with strict port\n- Electron CDP: ${cdpPort}\n- Temp data directory: \`${tempDataDir}\`\n- Temp HOME: \`${tempHomeDir}\`\n- Fake helper: \`${helperPath}\`\n- Production database used: no\n- SQLite database created: ${existsSync(path.join(tempDataDir, 'GPUWatcher', 'gpuwatcher.sqlite3')) ? 'yes' : 'no'}\n- Assertions: filters, grouping, sort reachability, table overflow, density, modal keyboard lifecycle, sanitization, cached refresh error, vanished options, and no-processes state\n- Screenshots:\n${screenshots.map((file) => `  - \`${file}\``).join('\n')}\n- Helper calls:\n\n\`\`\`json\n${helperLog}\`\`\`\n`);
  } finally {
    cdp?.socket.close();
  }
}

export async function runProcessLedgerSmoke() {
  const logs = { electron: [], vite: [] };
  const processSet = createProcessSet();
  try {
    await runScenario(logs, processSet);
  } catch (error) {
    await mkdir(evidenceDir, { recursive: true });
    await writeFile(path.join(evidenceDir, 'process-ledger-smoke-failure.txt'), `${error.stack ?? error.message}\n`);
    console.error(error);
    process.exitCode = 1;
  } finally {
    await writeFile(path.join(evidenceDir, 'process-ledger-vite.log'), logs.vite.join(''));
    await writeFile(path.join(evidenceDir, 'process-ledger-electron.log'), logs.electron.join(''));
    await processSet.terminate();
  }
}
