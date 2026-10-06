import { constants, existsSync } from 'node:fs';
import { access, cp, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { assertBridgeGuardrails, getBridgeInfo, writeGuardedHelper } from '../../shared/bridge.mjs';
import { connectCdp, screenshot } from '../../shared/cdp.mjs';
import { bridgeHelperHealth, bridgeListServers, clickText, setCheckboxByLabel, setInputByLabel } from '../../shared/dom.mjs';
import { createIsolatedDirs, createNonRepoCwd } from '../../shared/isolation.mjs';
import { appExecutable, canonicalDbPath, evidenceDir, helperPathForApp } from '../../shared/paths.mjs';
import { closeRun } from '../../shared/processes.mjs';
import { waitFor } from '../../shared/wait.mjs';

export function launchPackagedApp({ appPath, cwd, dataDir, port, extraEnv, logs, spawnLogged, timestamp }) {
  const env = { ...process.env, ...extraEnv };
  delete env.GPUWATCHER_HELPER_PATH;
  delete env.VITE_DEV_SERVER_URL;
  env.GPUWATCHER_TEST_DATA_DIR = dataDir;
  env.ELECTRON_ENABLE_LOGGING = '1';
  return spawnLogged({
    command: appExecutable(appPath),
    args: [`--remote-debugging-port=${port}`, `--user-data-dir=${path.join(dataDir, 'electron-user-data')}`],
    cwd,
    env,
    onOutput: (streamName, chunk) => logs.push(`[${timestamp()} packaged ${streamName}] ${chunk.toString()}`),
    onExit: (code, signal) => logs.push(`[${timestamp()} packaged exit] code=${code} signal=${signal}\n`)
  });
}

export async function connectPackagedCdp(port) {
  return connectCdp({ port, description: 'packaged Electron main CDP page', pagePredicate: page => page.type === 'page' && page.webSocketDebuggerUrl && String(page.url).startsWith('file:') && !String(page.url).includes('window=settings'), timeoutMs: 45000 });
}

export async function verifyPackagedRuntimePaths({ executablePath, helperPath }) {
  await access(executablePath, constants.X_OK);
  await access(helperPath, constants.X_OK);
}

export async function createPackagedCopy(appPath, dataDir) {
  const runtimeAppPath = path.join(dataDir, 'GPUWatcher.app');
  await cp(appPath, runtimeAppPath, { recursive: true, verbatimSymlinks: true });
  return { runtimeAppPath, runtimeHelperPath: helperPathForApp(runtimeAppPath) };
}

export async function runPackagedStartupScenario({ appPath, helperPath, logs, screenshots, spawnLogged, cdpPort, waitForText, timestamp }) {
  const { tempDataDir, tempHomeDir } = await createIsolatedDirs('gpuwatcher-task29-package-', 'gpuwatcher-task29-package-home-');
  let nonRepoCwd;
  let child;
  let cdp;
  let runtimeHelperPath;
  let realHelper;
  try {
    nonRepoCwd = await createNonRepoCwd('gpuwatcher task29 package cwd ');
    const copy = await createPackagedCopy(appPath, tempDataDir);
    runtimeHelperPath = copy.runtimeHelperPath;
    realHelper = `${runtimeHelperPath}.real`;
    await rename(runtimeHelperPath, realHelper);
    const guardLog = path.join(tempDataDir, 'packaged-guard.jsonl');
    await writeGuardedHelper(runtimeHelperPath, realHelper, guardLog);
    child = launchPackagedApp({ appPath: copy.runtimeAppPath, cwd: nonRepoCwd, dataDir: tempDataDir, port: cdpPort, extraEnv: { HOME: tempHomeDir }, logs, spawnLogged, timestamp });
    cdp = await connectPackagedCdp(cdpPort);
    await waitForText(cdp, 'GPUWatcher', 45000);
    await waitForText(cdp, '등록된 서버가 없습니다');
    const initialScreenshot = await screenshot(cdp, evidenceDir, 'task-29-packaged-sidebar-initial.png', file => screenshots.push(file));
    const info = await getBridgeInfo(cdp);
    assertBridgeGuardrails(info, 'packaged app');
    if (!info.url.startsWith('file:')) throw new Error('Packaged app used a dev renderer fallback');
    const helperHealth = await bridgeHelperHealth(cdp);
    if (!helperHealth.ok) throw new Error(`Packaged helper health failed: ${JSON.stringify(helperHealth.error)}`);
    const initialServers = await bridgeListServers(cdp);
    if (!Array.isArray(initialServers) || initialServers.length !== 0) throw new Error(`Expected empty isolated registry, got ${JSON.stringify(initialServers)}`);
    await clickText(cdp, '서버 추가 또는 가져오기');
    await clickText(cdp, '직접 추가');
    await waitForText(cdp, '서버 추가');
    await waitForText(cdp, 'Save server');
    for (const [label, value] of [['Name', 'Task29 Packaged Server'], ['Host', 'smoke.invalid'], ['SSH port', '22'], ['Username', 'gpuwatcher-smoke'], ['SSH key path', ''], ['Polling interval seconds', '30']]) await setInputByLabel(cdp, label, value);
    await setCheckboxByLabel(cdp, 'Enabled', false);
    await clickText(cdp, 'Save server');
    await waitForText(cdp, 'Local configuration saved');
    const servers = await waitFor('packaged saved server registry', async () => {
      const listed = await bridgeListServers(cdp);
      return listed.length === 1 && listed[0].name === 'Task29 Packaged Server' && !listed[0].enabled ? listed : null;
    });
    await clickText(cdp, 'Close drawer');
    await waitForText(cdp, 'Task29 Packaged Server');
    const savedScreenshot = await screenshot(cdp, evidenceDir, 'task-29-packaged-sidebar-saved.png', file => screenshots.push(file));
    const dbPath = canonicalDbPath(tempDataDir);
    const guardActions = (await readFile(guardLog, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    return { tempDataDir, tempHomeDir, nonRepoCwd, dbPath, dbExistedBeforeCleanup: existsSync(dbPath), initialScreenshot, savedScreenshot, bridgeInfo: info, helperHealth, servers, helperPath, appPath, runtimeAppPath: copy.runtimeAppPath, runtimeHelperPath, guardActions, isolatedCopyRemoved: true };
  } finally {
    await closeRun(cdp, child);
    if (realHelper && existsSync(realHelper)) {
      await rm(runtimeHelperPath, { force: true });
      await rename(realHelper, runtimeHelperPath);
    }
    await rm(tempDataDir, { recursive: true, force: true });
    await rm(tempHomeDir, { recursive: true, force: true });
    if (nonRepoCwd) await rm(path.dirname(nonRepoCwd), { recursive: true, force: true });
  }
}
