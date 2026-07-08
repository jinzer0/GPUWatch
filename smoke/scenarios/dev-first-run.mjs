import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { connectCdp, screenshot } from '../shared/cdp.mjs';
import { buildDevFirstRunEvidence } from './dev-first-run-evidence.mjs';
import { clickNav, clickText, waitForText } from '../shared/dom.mjs';
import { createIsolatedDirs, prepareIsolatedSshConfig } from '../shared/isolation.mjs';
import { createProcessSet } from '../shared/processes.mjs';
import { devHelperPath, electronExecutable, evidenceDir, executable, root } from '../shared/paths.mjs';
import { waitFor } from '../shared/wait.mjs';
import { runBridgeGuardrails } from './dev-first-run/bridge-guardrails.mjs';
import { runSettingsCleanupScenario } from './dev-first-run/cleanup.mjs';
import { runHistoryRefreshScenario } from './dev-first-run/history-refresh.mjs';
import { runProcessRefreshScenario } from './dev-first-run/process-refresh.mjs';
import { runSanitizedErrorScenario } from './dev-first-run/sanitized-error.mjs';
import { runSettingsImportScenario } from './dev-first-run/settings-import.mjs';

const viteUrl = 'http://127.0.0.1:5173';
const cdpPort = 9339;
const task9Prefix = 'task-9';
async function smokeWaitForText(cdp, text, timeoutMs = 15000) {
  return waitForText(cdp, text, { evidenceDir, missingPrefix: task9Prefix, timeoutMs });
}

async function runScenario(logs, spawnLogged) {
  await mkdir(evidenceDir, { recursive: true });
  const { tempDataDir, tempHomeDir } = await createIsolatedDirs('gpuwatcher-task-14-', 'gpuwatcher-task-14-home-');
  await prepareIsolatedSshConfig(tempHomeDir);
  const helperPath = devHelperPath();
  if (!existsSync(helperPath)) {
    throw new Error(`Helper binary missing at ${helperPath}; run npm run helper:build before this smoke.`);
  }

  spawnLogged({
    command: executable('vite'),
    args: ['--host', '127.0.0.1', '--port', '5173', '--strictPort'],
    cwd: root,
    env: {},
    onOutput: (streamName, chunk) => logs.vite.push(`[${streamName}] ${chunk.toString()}`)
  });
  await waitFor('Vite dev server', async () => {
    const response = await fetch(viteUrl).catch(() => null);
    return response?.ok;
  });

  spawnLogged({
    command: electronExecutable(),
    args: [`--remote-debugging-port=${cdpPort}`, path.join(root, 'dist-electron', 'electron', 'main.js')],
    cwd: root,
    env: {
      VITE_DEV_SERVER_URL: viteUrl,
      GPUWATCHER_TEST_DATA_DIR: tempDataDir,
      GPUWATCHER_HELPER_PATH: helperPath,
      HOME: tempHomeDir,
      ELECTRON_ENABLE_LOGGING: '1'
    },
    onOutput: (streamName, chunk) => logs.electron.push(`[${streamName}] ${chunk.toString()}`)
  });

  const screenshots = [];
  const cdp = await connectCdp({
    port: cdpPort,
    description: 'Electron CDP page',
    pagePredicate: (page) => page.type === 'page' && page.webSocketDebuggerUrl && String(page.url).startsWith(viteUrl),
    timeoutMs: 30000
  });
  await smokeWaitForText(cdp, 'GPUWatcher v0.1', 30000);
  await smokeWaitForText(cdp, 'Remote GPU console');
  await screenshot(cdp, evidenceDir, 'task-9-electron-first-run-initial.png', (file) => screenshots.push(file));

  const { bridgeInfo, electronMetaKeys } = await runBridgeGuardrails(cdp);

  await clickNav(cdp, 'Settings');
  const { importSurface, savedServerId, servers } = await runSettingsImportScenario(cdp, { smokeWaitForText, screenshots });
  const { errorSurface, afterErrorBody } = await runSanitizedErrorScenario(cdp, { smokeWaitForText, screenshots });

  await clickNav(cdp, 'Overview');
  await smokeWaitForText(cdp, 'Fleet snapshot');
  await clickText(cdp, 'Seed demo data');
  const seededBody = await smokeWaitForText(cdp, 'Demo data seeded');
  await smokeWaitForText(cdp, 'Task 14 Smoke Server Edited');

  const processBody = await runProcessRefreshScenario(cdp, { smokeWaitForText, screenshots });
  const historyBody = await runHistoryRefreshScenario(cdp, { smokeWaitForText, screenshots });
  await runSettingsCleanupScenario(cdp, { smokeWaitForText, screenshots });

  const dbPath = path.join(tempDataDir, 'GPUWatcher', 'gpuwatcher.sqlite3');
  const evidence = buildDevFirstRunEvidence({ tempDataDir, tempHomeDir, dbPath, bridgeInfo, electronMetaKeys, savedServerId, servers, importSurface, errorSurface, afterErrorBody, seededBody, processBody, historyBody, screenshots });
  await writeFile(path.join(evidenceDir, 'task-9-electron-first-run-ui-parity.txt'), `${evidence.parityEvidence}\n`);
  await writeFile(path.join(evidenceDir, 'task-9-visible-error-path.txt'), `${evidence.errorEvidence}\n`);
  await writeFile(path.join(evidenceDir, 'task-14-gpuwatcher-followup-hardening.txt'), `${evidence.task14Evidence}\n`);
  await writeFile(path.join(evidenceDir, 'task-9-vite.log'), logs.vite.join(''));
  await writeFile(path.join(evidenceDir, 'task-9-electron.log'), logs.electron.join(''));
  await writeFile(path.join(evidenceDir, 'task-14-vite.log'), logs.vite.join(''));
  await writeFile(path.join(evidenceDir, 'task-14-electron.log'), logs.electron.join(''));
  cdp.socket.close();
  console.log(evidence.parityEvidence);
  console.log('');
  console.log(evidence.errorEvidence);
  console.log('');
  console.log(evidence.task14Evidence);
}

export async function runDevFirstRunSmoke() {
  const logs = { vite: [], electron: [] };
  const processSet = createProcessSet();
  try {
    await runScenario(logs, processSet.spawnLogged);
  } catch (error) {
    await mkdir(evidenceDir, { recursive: true });
    await writeFile(path.join(evidenceDir, 'task-9-smoke-failure.txt'), `${error.stack ?? error.message}\n`);
    await writeFile(path.join(evidenceDir, 'task-14-smoke-failure.txt'), `${error.stack ?? error.message}\n`);
    await writeFile(path.join(evidenceDir, 'task-9-vite.log'), logs.vite.join(''));
    await writeFile(path.join(evidenceDir, 'task-9-electron.log'), logs.electron.join(''));
    await writeFile(path.join(evidenceDir, 'task-14-vite.log'), logs.vite.join(''));
    await writeFile(path.join(evidenceDir, 'task-14-electron.log'), logs.electron.join(''));
    console.error(error);
    process.exitCode = 1;
  } finally {
    await processSet.terminate();
  }
}
