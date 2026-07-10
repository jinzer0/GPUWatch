import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { assertBridgeGuardrails, getBridgeInfo } from '../../shared/bridge.mjs';
import { connectCdp, screenshot } from '../../shared/cdp.mjs';
import { bridgeHelperHealth, bridgeListServers, clickText, setCheckboxByLabel, setInputByLabel } from '../../shared/dom.mjs';
import { createIsolatedDirs, createNonRepoCwd } from '../../shared/isolation.mjs';
import { appExecutable, canonicalDbPath, evidenceDir } from '../../shared/paths.mjs';
import { closeRun } from '../../shared/processes.mjs';
import { waitFor } from '../../shared/wait.mjs';

export function launchPackagedApp({ appPath, cwd, dataDir, port, extraEnv, logs, spawnLogged, timestamp }) {
  const env = { ...process.env, ...extraEnv };
  delete env.GPUWATCHER_HELPER_PATH;
  env.GPUWATCHER_TEST_DATA_DIR = dataDir;
  env.ELECTRON_ENABLE_LOGGING = '1';
  return spawnLogged({
    command: appExecutable(appPath),
    args: [`--remote-debugging-port=${port}`],
    cwd,
    env,
    onOutput: (streamName, chunk) => logs.push(`[${timestamp()} packaged ${streamName}] ${chunk.toString()}`),
    onExit: (code, signal) => logs.push(`[${timestamp()} packaged exit] code=${code} signal=${signal}\n`)
  });
}

export async function connectPackagedCdp(port) {
  return connectCdp({
    port,
    description: 'packaged Electron CDP page',
    pagePredicate: (page) => page.type === 'page' && page.webSocketDebuggerUrl && !String(page.url).startsWith('devtools://'),
    timeoutMs: 45000
  });
}

export async function verifyPackagedRuntimePaths({ executablePath, helperPath }) {
  await access(executablePath, constants.X_OK);
  await access(helperPath, constants.X_OK);
}

export async function runPackagedStartupScenario({ appPath, helperPath, logs, screenshots, spawnLogged, cdpPort, waitForText, timestamp }) {
  const { tempDataDir, tempHomeDir } = await createIsolatedDirs('gpuwatcher-task-2-success-', 'gpuwatcher-task-2-success-home-');
  const nonRepoCwd = await createNonRepoCwd('gpuwatcher task 2 cwd parent ');
  const child = launchPackagedApp({ appPath, cwd: nonRepoCwd, dataDir: tempDataDir, port: cdpPort, extraEnv: { HOME: tempHomeDir }, logs, spawnLogged, timestamp });
  const cdp = await connectPackagedCdp(cdpPort);
  await waitForText(cdp, 'GPUWatcher v0.1', 45000);
  await waitForText(cdp, 'Remote GPU console');
  const initialScreenshot = await screenshot(cdp, evidenceDir, 'task-2-gpuwatcher-maintainability-refactor-plan-packaged-app-initial.png', (file) => screenshots.push(file));
  const info = await getBridgeInfo(cdp);
  assertBridgeGuardrails(info, 'packaged app');

  const helperHealth = await bridgeHelperHealth(cdp);
  if (!helperHealth.ok) {
    throw new Error(`Packaged helper health failed: ${JSON.stringify(helperHealth.error)}`);
  }
  const initialServers = await bridgeListServers(cdp);
  if (!Array.isArray(initialServers) || initialServers.length !== 0) {
    throw new Error(`Expected empty isolated server list, got ${JSON.stringify(initialServers)}`);
  }

  await clickText(cdp, 'Settings');
  await waitForText(cdp, 'Server registry');
  await setInputByLabel(cdp, 'Name', 'Task 2 Packaged Server');
  await setInputByLabel(cdp, 'Host', '127.0.0.1');
  await setInputByLabel(cdp, 'SSH port', '1');
  await setInputByLabel(cdp, 'Username', 'gpuwatcher-smoke');
  await setInputByLabel(cdp, 'SSH key path', '');
  await setInputByLabel(cdp, 'Polling interval seconds', '30');
  await setCheckboxByLabel(cdp, 'Enabled', false);
  await clickText(cdp, 'Save server');
  await waitForText(cdp, 'Task 2 Packaged Server');
  const servers = await waitFor('packaged saved server list', async () => {
    const listed = await bridgeListServers(cdp);
    return listed.length === 1 && listed[0].name === 'Task 2 Packaged Server' ? listed : null;
  });
  const savedScreenshot = await screenshot(cdp, evidenceDir, 'task-2-gpuwatcher-maintainability-refactor-plan-packaged-app-settings-saved.png', (file) => screenshots.push(file));
  await closeRun(cdp, child);

  return {
    tempDataDir,
    tempHomeDir,
    nonRepoCwd,
    dbPath: canonicalDbPath(tempDataDir),
    initialScreenshot,
    savedScreenshot,
    bridgeInfo: info,
    helperHealth,
    servers,
    helperPath,
    appPath
  };
}
