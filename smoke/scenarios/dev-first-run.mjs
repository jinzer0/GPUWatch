import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assertBridgeGuardrails, getBridgeInfo, writeGuardedHelper } from '../shared/bridge.mjs';
import { cdpUrl, connectCdp, evaluate, screenshot } from '../shared/cdp.mjs';
import { bodyText, bridgeListServers, clickText, setCheckboxByLabel, setInputByLabel, waitForEnabledClickableText, waitForText } from '../shared/dom.mjs';
import { createIsolatedDirs, prepareIsolatedSshConfig } from '../shared/isolation.mjs';
import { closeRun, createProcessSet } from '../shared/processes.mjs';
import { devHelperPath, electronExecutable, evidenceDir, executable, root } from '../shared/paths.mjs';
import { waitFor } from '../shared/wait.mjs';
import { buildDevFirstRunEvidence } from './dev-first-run-evidence.mjs';

const viteUrl = 'http://127.0.0.1:5173';
const cdpPort = 9339;
const text = (cdp, value) => waitForText(cdp, value, { evidenceDir, missingPrefix: 'task-29' });
const assert = (value, message) => { if (!value) throw new Error(message); };
const bridge = (cdp, method, payload = {}) => evaluate(cdp, `window.gpuwatcher[${JSON.stringify(method)}](${JSON.stringify(payload)}).then(r => { if (!r.ok) throw new Error(JSON.stringify(r.error)); return r.data; })`);

async function clickSelector(cdp, selector) {
  await evaluate(cdp, `(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e || e.disabled) throw new Error('Missing enabled control: ' + ${JSON.stringify(selector)}); e.click(); })()`);
}
async function rowAction(cdp, id, action) {
  await clickSelector(cdp, `[data-server-menu-trigger="${id}"]`);
  await waitForEnabledClickableText(cdp, action);
  await clickText(cdp, action);
}
async function closeSheet(cdp) {
  await clickText(cdp, 'Close drawer');
  await waitFor('management sheet closed', () => evaluate(cdp, '!document.querySelector(".server-manager-modal")'));
}
async function fillServer(cdp, name) {
  await text(cdp, 'Save server');
  for (const [label, value] of [['Name', name], ['Host', 'smoke.invalid'], ['SSH port', '22'], ['Username', 'gpuwatcher-smoke'], ['SSH key path', ''], ['Polling interval seconds', '30']]) await setInputByLabel(cdp, label, value);
  await setCheckboxByLabel(cdp, 'Enabled', false);
  await clickText(cdp, 'Save server');
  await text(cdp, 'Local configuration saved');
}

// The wrapper rejects every network-capable action before executing the actual
// helper. Local persistence/DTO reads are never mocked. Empty outbox consumption
// prevents OS notifications even if a fixture accidentally creates an event.
async function createGuard(dataDir, realHelper) {
  const guardPath = path.join(dataDir, 'guard-helper.cjs');
  const guardLog = path.join(dataDir, 'guard-actions.jsonl');
  await writeGuardedHelper(guardPath, realHelper, guardLog);
  return { guardPath, guardLog };
}

async function checkAppearance(cdp, port, sockets) {
  const opened = await evaluate(cdp, 'Promise.all([window.gpuwatcherUi.openSettings(), window.gpuwatcherUi.openSettings()])');
  assert(opened.every(response => response.ok), 'Appearance window failed to open');
  const settings = await connectCdp({ port, description: 'appearance window', pagePredicate: p => p.type === 'page' && String(p.url).includes('window=settings') });
  sockets.push(settings);
  await text(settings, '외형');
  const pages = await (await fetch(`${cdpUrl(port)}/json/list`)).json();
  assert(pages.filter(p => p.type === 'page' && String(p.url).includes('window=settings')).length === 1, 'Settings window was not singleton');
  await clickSelector(settings, 'input[value="dark"]');
  await waitFor('theme synchronized in both renderers', async () => {
    const states = await Promise.all([cdp, settings].map(page => evaluate(page, 'window.gpuwatcherUi.getAppearance()')));
    return states.every(response => response.ok && response.data.mode === 'dark' && response.data.resolved === 'dark') && await evaluate(cdp, 'document.documentElement.dataset.appearance === "dark"') && await evaluate(settings, 'document.documentElement.dataset.appearance === "dark"');
  });
  assert(!/Server registry|GPU 사용률/.test(await bodyText(settings)), 'Settings initialized monitoring UI');
  return 'One appearance window; dark mode synchronized in both renderer documents';
}

export async function runDevFirstRunSmoke() {
  const processes = createProcessSet();
  const logs = { vite: [], electron: [] };
  const sockets = [];
  let activeCdp;
  let tempDataDir;
  let tempHomeDir;
  await mkdir(evidenceDir, { recursive: true });
  try {
    ({ tempDataDir, tempHomeDir } = await createIsolatedDirs('gpuwatcher-task29-', 'gpuwatcher-task29-home-'));
    await prepareIsolatedSshConfig(tempHomeDir);
    const realHelper = devHelperPath();
    assert(existsSync(realHelper), `Missing built helper: ${realHelper}`);
    const { guardPath, guardLog } = await createGuard(tempDataDir, realHelper);
    const userData = path.join(tempDataDir, 'electron-user-data');
    const env = { HOME: tempHomeDir, GPUWATCHER_TEST_DATA_DIR: tempDataDir, GPUWATCHER_HELPER_PATH: guardPath, VITE_DEV_SERVER_URL: viteUrl };
    processes.spawnLogged({ command: executable('vite'), args: ['--host', '127.0.0.1', '--port', '5173', '--strictPort'], cwd: root, env, onOutput: (s, c) => logs.vite.push(`[${s}] ${c}`) });
    await waitFor('isolated Vite', async () => (await fetch(viteUrl).catch(() => null))?.ok);
    const launch = async port => {
      const child = processes.spawnLogged({ command: electronExecutable(), args: [`--remote-debugging-port=${port}`, `--user-data-dir=${userData}`, path.join(root, 'dist-electron/electron/main.js')], cwd: root, env, onOutput: (s, c) => logs.electron.push(`[${s}] ${c}`) });
      const cdp = await connectCdp({ port, description: 'main renderer', pagePredicate: p => p.type === 'page' && p.url === `${viteUrl}/` });
      sockets.push(cdp);
      activeCdp = cdp;
      await text(cdp, 'GPUWatcher');
      return { cdp, child };
    };
    let { cdp, child } = await launch(cdpPort);
    await text(cdp, '등록된 서버가 없습니다');
    const bridgeInfo = await getBridgeInfo(cdp);
    const { electronMetaKeys } = assertBridgeGuardrails(bridgeInfo, 'Task29 dev');
    assert((await bridgeListServers(cdp)).length === 0, 'Isolation did not start empty');
    await clickText(cdp, '서버 추가 또는 가져오기');
    await clickText(cdp, '직접 추가');
    await text(cdp, '서버 추가');
    await fillServer(cdp, 'Task29 Smoke Server');
    const saved = (await bridgeListServers(cdp))[0];
    assert(saved && !saved.enabled, 'UI add did not save disabled server');
    await closeSheet(cdp);
    await rowAction(cdp, saved.id, '서버 편집');
    await text(cdp, 'Save server');
    await setInputByLabel(cdp, 'Name', 'Task29 Smoke Server Edited');
    await clickText(cdp, 'Save server');
    await text(cdp, 'Local configuration saved');
    await closeSheet(cdp);
    await clickText(cdp, '서버 추가 또는 가져오기');
    await clickText(cdp, 'SSH config 가져오기');
    await waitForEnabledClickableText(cdp, 'Import from SSH config');
    await clickText(cdp, 'Import from SSH config');
    const importSurface = await text(cdp, 'SSH config import candidates');
    assert(/task14-import-warning/.test(importSurface) && /ProxyCommand|Include/i.test(importSurface), 'Isolated SSH fixture warnings missing');
    assert(!/raw-secret|\/Users\/alice\/\.ssh\/id_ed25519/.test(importSurface), 'Import diagnostic leaked fixture secrets');
    await clickText(cdp, 'Select all valid hosts');
    await waitForEnabledClickableText(cdp, 'Save selected hosts');
    await clickText(cdp, 'Save selected hosts');
    await text(cdp, 'Bulk import summary');
    const imported = (await bridgeListServers(cdp)).filter(server => server.id !== saved.id);
    assert(imported.length === 2 && imported.every(server => !server.enabled), 'Bulk import did not persist both disabled fixture hosts');
    await closeSheet(cdp);
    for (const server of imported) {
      await rowAction(cdp, server.id, '서버 삭제');
      await text(cdp, `Delete ${server.name}?`);
      await clickText(cdp, `Confirm delete ${server.name}`);
      await waitFor('import fixture deletion', async () => !(await bridgeListServers(cdp)).some(candidate => candidate.id === server.id));
      await waitFor('import delete sheet closed', () => evaluate(cdp, '!document.querySelector(".server-manager-modal")'));
    }
    await rowAction(cdp, saved.id, '연결 테스트');
    // Opening this explicit saved-target action starts one test automatically.
    const errorSurface = await text(cdp, 'SIMULATED Task29 network blocked');
    await closeSheet(cdp);
    // Verify explicit monitoring control without enabling a test server or polling.
    await clickSelector(cdp, `[data-server-menu-trigger="${saved.id}"]`);
    await waitForEnabledClickableText(cdp, '모니터링 시작');
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    // Seed only telemetry fixtures; there is deliberately no renderer seed button.
    await bridge(cdp, 'seedDemoData');
    await closeRun(cdp, child);
    ({ cdp, child } = await launch(cdpPort + 1));
    await clickText(cdp, 'Task29 Smoke Server Edited');
    await waitFor('actual fixture GPU', () => evaluate(cdp, 'Boolean(document.querySelector(".gpu-card summary"))'));
    const detail = await bridge(cdp, 'getServerDetail', { id: saved.id });
    assert(detail.gpus.length > 0 && detail.gpus.every(g => g.availability?.state === 'unknown'), 'Disabled fixture GPU availability was not unknown');
    await clickSelector(cdp, '.gpu-card > details > summary');
    await clickSelector(cdp, '.gpu-card .gpu-extra-metrics > summary');
    await waitFor('nested GPU disclosure', () => evaluate(cdp, 'document.querySelector(".gpu-card > details").open && document.querySelector(".gpu-extra-metrics").open'));
    await text(cdp, 'PCIe');
    const gpu = detail.gpus[0];
    await waitForEnabledClickableText(cdp, 'Notify when available');
    await clickText(cdp, 'Notify when available');
    await text(cdp, '알림 활성화');
    const defaultRule = (await bridge(cdp, 'listWatchRules', { serverId: saved.id }))[0];
    assert(defaultRule.enabled && defaultRule.gpuUuid === gpu.uuid && defaultRule.utilizationThresholdPercent === 5 && defaultRule.memoryThresholdMiB === 1024 && defaultRule.sustainSeconds === 300 && defaultRule.cooldownSeconds === 900, 'UI did not persist actual default watch values');
    // A saved custom watch is a controlled fixture, not a fabricated availability DTO.
    await bridge(cdp, 'saveGpuAvailableWatch', { input: { id: defaultRule.id, serverId: saved.id, gpuUuid: gpu.uuid, gpuIndex: gpu.index, enabled: true, utilizationThresholdPercent: 3, memoryThresholdMiB: 512, sustainSeconds: 420, cooldownSeconds: 120 } });
    await closeRun(cdp, child);
    ({ cdp, child } = await launch(cdpPort + 2));
    await waitFor('selected server restored', () => evaluate(cdp, `document.querySelector('.server-sidebar-row[aria-current="page"]')?.textContent.includes('Task29 Smoke Server Edited') && localStorage.getItem('gpuwatcher:last-server-id') === ${JSON.stringify(saved.id)}`));
    await waitFor('GPU restored', () => evaluate(cdp, 'Boolean(document.querySelector(".gpu-card summary"))'));
    assert(await evaluate(cdp, '!document.querySelector(".gpu-card > details").open'), 'Session disclosure leaked across relaunch');
    await clickSelector(cdp, '.gpu-card > details > summary');
    await text(cdp, '알림 활성화');
    const originalRule = (await bridge(cdp, 'listWatchRules', { serverId: saved.id }))[0];
    assert(originalRule.utilizationThresholdPercent === 3 && originalRule.memoryThresholdMiB === 512 && originalRule.sustainSeconds === 420 && originalRule.cooldownSeconds === 120, 'Actual helper did not preserve custom fixture values');
    await text(cdp, '저장된 재알림 간격: 120초');
    await text(cdp, '실제 적용: 900초');
    await text(cdp, 'OS 알림 권한: unknown');
    await clickText(cdp, `Disable custom-condition watch for GPU ${gpu.index}`);
    await waitForEnabledClickableText(cdp, `Enable custom-condition watch for GPU ${gpu.index}`);
    const offRule = (await bridge(cdp, 'listWatchRules', { serverId: saved.id }))[0];
    await clickText(cdp, `Enable custom-condition watch for GPU ${gpu.index}`);
    await text(cdp, '알림 활성화');
    const onRule = (await bridge(cdp, 'listWatchRules', { serverId: saved.id }))[0];
    for (const key of ['id', 'utilizationThresholdPercent', 'memoryThresholdMiB', 'sustainSeconds', 'cooldownSeconds']) assert(originalRule[key] === offRule[key] && originalRule[key] === onRule[key], `Custom watch lost ${key} on off/on`);
    assert(!offRule.enabled && onRule.enabled, 'Watch did not toggle');
    const appearance = await checkAppearance(cdp, cdpPort + 2, sockets);
    const screenshots = [await screenshot(cdp, evidenceDir, 'task-29-dev-gpu-watch.png')];
    await closeRun(cdp, child);
    ({ cdp, child } = await launch(cdpPort + 3));
    const persistedRule = (await bridge(cdp, 'listWatchRules', { serverId: saved.id }))[0];
    assert(JSON.stringify(persistedRule) === JSON.stringify(onRule), 'Watch saved values changed on relaunch');
    const relaunchedDetail = await bridge(cdp, 'getServerDetail', { id: saved.id });
    assert(relaunchedDetail.gpus.every(g => g.availability.state === 'unknown' && g.availability.conditionStartedAt === null), 'Continuous availability inherited on relaunch');
    // Backend history remains readable, while no History UI is rendered.
    const history = await bridge(cdp, 'listGpuHistory', { serverId: saved.id, range: '1h' });
    assert(history && Array.isArray(history.series), 'Backend History contract missing');
    assertBridgeGuardrails(await getBridgeInfo(cdp), 'relaunch');
    await rowAction(cdp, saved.id, '서버 삭제');
    await text(cdp, `Delete Task29 Smoke Server Edited?`);
    await clickText(cdp, 'Cancel delete');
    assert((await bridgeListServers(cdp)).length === 1, 'Cancel delete removed server');
    await rowAction(cdp, saved.id, '서버 삭제');
    await clickText(cdp, 'Confirm delete Task29 Smoke Server Edited');
    await waitFor('UI delete persisted', async () => (await bridgeListServers(cdp)).length === 0);
    await text(cdp, '등록된 서버가 없습니다');
    const guardActions = (await readFile(guardLog, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    assert(guardActions.some(entry => entry.action === 'test_connection'), 'Test never reached network guard');
    assert(guardActions.filter(entry => entry.action === 'reset_availability_observations').length >= 4, 'Main startup availability reset did not reach the real helper on every launch');
    const evidence = buildDevFirstRunEvidence({ tempDataDir, tempHomeDir, dbPath: path.join(tempDataDir, 'GPUWatcher/gpuwatcher.sqlite3'), bridgeInfo, electronMetaKeys, savedServerId: saved.id, importSurface, errorSurface, detail, originalRule, offRule, onRule, persistedRule, appearance, screenshots, guardActions });
    await writeFile(path.join(evidenceDir, 'task-29-dev-first-run.txt'), `${evidence.task29Evidence}\n`);
    console.log(evidence.task29Evidence);
  } catch (error) {
    await writeFile(path.join(evidenceDir, 'task-29-smoke-failure.txt'), `${error.stack ?? error}\n`);
    if (activeCdp?.socket.readyState === 1) {
      const diagnostic = await evaluate(activeCdp, '({url: location.href, online: navigator.onLine, body: document.body.innerText})').catch(failure => ({ captureError: String(failure) }));
      if (tempDataDir) diagnostic.guardLog = await readFile(path.join(tempDataDir, 'guard-actions.jsonl'), 'utf8').catch(() => 'unavailable');
      await writeFile(path.join(evidenceDir, 'task-29-smoke-failure-renderer.json'), `${JSON.stringify(diagnostic, null, 2)}\n`);
    }
    console.error(error);
    process.exitCode = 1;
  } finally {
    for (const cdp of sockets) cdp.socket.close();
    await processes.terminate();
    await writeFile(path.join(evidenceDir, 'task-29-vite.log'), logs.vite.join(''));
    await writeFile(path.join(evidenceDir, 'task-29-electron.log'), logs.electron.join(''));
    if (tempDataDir) await rm(tempDataDir, { recursive: true, force: true });
    if (tempHomeDir) await rm(tempHomeDir, { recursive: true, force: true });
  }
}
