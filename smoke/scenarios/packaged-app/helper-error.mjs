import { existsSync } from 'node:fs';
import { chmod, stat } from 'node:fs/promises';
import { screenshot } from '../../shared/cdp.mjs';
import { bodyText, bridgeHelperHealth, clickText, setCheckboxByLabel, setInputByLabel } from '../../shared/dom.mjs';
import { createIsolatedDirs, createNonRepoCwd } from '../../shared/isolation.mjs';
import { evidenceDir } from '../../shared/paths.mjs';
import { closeRun } from '../../shared/processes.mjs';
import { waitFor } from '../../shared/wait.mjs';
import { connectPackagedCdp, launchPackagedApp } from './startup.mjs';

export async function runPackagedHelperErrorScenario({ appPath, helperPath, logs, screenshots, spawnLogged, cdpPort, waitForText, timestamp }) {
  const originalMode = (await stat(helperPath)).mode;
  const { tempDataDir, tempHomeDir } = await createIsolatedDirs('gpuwatcher-task-2-failure-', 'gpuwatcher-task-2-failure-home-');
  const nonRepoCwd = await createNonRepoCwd('gpuwatcher task 2 failure cwd parent ');
  await chmod(helperPath, originalMode & ~0o111);

  let cdp;
  let child;
  try {
    child = launchPackagedApp({ appPath, cwd: nonRepoCwd, dataDir: tempDataDir, port: cdpPort, extraEnv: { HOME: tempHomeDir }, logs, spawnLogged, timestamp });
    cdp = await connectPackagedCdp(cdpPort);
    await waitForText(cdp, 'GPUWatcher v0.1', 45000);
    await clickText(cdp, 'Settings');
    await waitForText(cdp, 'Server registry');
    const bridgeError = await bridgeHelperHealth(cdp);
    if (bridgeError.ok || bridgeError.error?.layer !== 'helper_contract' || !/helper_(spawn_failed|runner_error)/.test(bridgeError.error?.type ?? '')) {
      throw new Error(`Expected structured helper_contract helper failure through renderer bridge, got ${JSON.stringify(bridgeError)}`);
    }
    await setInputByLabel(cdp, 'Name', 'Task 2 Helper Failure Server');
    await setInputByLabel(cdp, 'Host', '127.0.0.1');
    await setInputByLabel(cdp, 'SSH port', '1');
    await setInputByLabel(cdp, 'Username', 'gpuwatcher-smoke');
    await setInputByLabel(cdp, 'SSH key path', '');
    await setInputByLabel(cdp, 'Polling interval seconds', '30');
    await setCheckboxByLabel(cdp, 'Enabled', false);
    await clickText(cdp, 'Save server');
    const errorBody = await waitFor('visible non-executable helper error', async () => {
      const text = await bodyText(cdp);
      return /permission denied|EACCES|failed to spawn helper|spawn .*gpuwatcher-helper/i.test(text) ? text : null;
    }, 45000);
    const errorScreenshot = await screenshot(cdp, evidenceDir, 'task-2-gpuwatcher-maintainability-refactor-plan-packaged-helper-nonexec-error.png', (file) => screenshots.push(file));
    await clickText(cdp, 'Overview');
    await waitForText(cdp, 'Fleet snapshot');
    await clickText(cdp, 'Settings');
    await waitForText(cdp, 'Server registry');
    const navigableBody = await bodyText(cdp);
    await closeRun(cdp, child);
    return { tempDataDir, tempHomeDir, nonRepoCwd, bridgeError, errorBody, errorScreenshot, navigableBody };
  } finally {
    await chmod(helperPath, originalMode);
    if (cdp || child) {
      await closeRun(cdp, child);
    }
  }
}

export function helperRestored(helperPath) {
  return existsSync(helperPath);
}
