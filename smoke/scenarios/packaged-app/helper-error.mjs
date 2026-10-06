import { existsSync, statSync } from 'node:fs';
import { chmod, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { evaluate, screenshot } from '../../shared/cdp.mjs';
import { bodyText, bridgeHelperHealth, clickText, setCheckboxByLabel, setInputByLabel, waitForEnabledClickableText } from '../../shared/dom.mjs';
import { createIsolatedDirs, createNonRepoCwd } from '../../shared/isolation.mjs';
import { evidenceDir } from '../../shared/paths.mjs';
import { closeRun } from '../../shared/processes.mjs';
import { waitFor } from '../../shared/wait.mjs';
import { connectPackagedCdp, createPackagedCopy, launchPackagedApp } from './startup.mjs';

export async function runPackagedHelperErrorScenario({ appPath, helperPath, logs, screenshots, spawnLogged, cdpPort, waitForText, timestamp }) {
  const { tempDataDir, tempHomeDir } = await createIsolatedDirs('gpuwatcher-task29-package-fault-', 'gpuwatcher-task29-package-fault-home-');
  let nonRepoCwd;
  let cdp;
  let child;
  let faultHelperPath;
  let originalMode;
  try {
    nonRepoCwd = await createNonRepoCwd('gpuwatcher task29 package fault cwd ');
    const copy = await createPackagedCopy(appPath, tempDataDir);
    faultHelperPath = copy.runtimeHelperPath;
    originalMode = (await stat(faultHelperPath)).mode;
    // Fault injection affects only our disposable app copy, never release/electron.
    // No helper can execute, so neither collectors nor notification consumption run.
    await chmod(faultHelperPath, originalMode & ~0o111);
    child = launchPackagedApp({ appPath: copy.runtimeAppPath, cwd: nonRepoCwd, dataDir: tempDataDir, port: cdpPort, extraEnv: { HOME: tempHomeDir }, logs, spawnLogged, timestamp });
    cdp = await connectPackagedCdp(cdpPort);
    await waitForText(cdp, 'GPUWatcher', 45000);
    const bridgeError = await bridgeHelperHealth(cdp);
    if (bridgeError.ok || bridgeError.error?.layer !== 'helper_contract' || !/helper_(spawn_failed|runner_error)/.test(bridgeError.error?.type ?? '')) throw new Error(`Expected packaged nonexec helper error without dev fallback, got ${JSON.stringify(bridgeError)}`);
    await clickText(cdp, '서버 추가 또는 가져오기');
    await waitForEnabledClickableText(cdp, '직접 추가');
    await clickText(cdp, '직접 추가');
    await waitFor('initial error sheet focus established', () => evaluate(cdp, '!!document.activeElement?.closest(".server-manager-modal")'));
    await waitForText(cdp, '서버 추가');
    await waitForText(cdp, 'Save server');
    for (const [label, value] of [['Name', 'Task29 Helper Failure Server'], ['Host', 'smoke.invalid'], ['SSH port', '22'], ['Username', 'gpuwatcher-smoke'], ['SSH key path', ''], ['Polling interval seconds', '30']]) await setInputByLabel(cdp, label, value);
    await setCheckboxByLabel(cdp, 'Enabled', false);
    await clickText(cdp, 'Save server');
    const errorBody = await waitFor('visible actual packaged helper failure', async () => {
      const value = await bodyText(cdp);
      return /permission denied|EACCES|failed to spawn helper|spawn .*gpuwatcher-helper/i.test(value) ? value : null;
    }, 45000);
    const errorScreenshot = await screenshot(cdp, evidenceDir, 'task-29-packaged-helper-nonexec-error.png', file => screenshots.push(file));
    await clickText(cdp, 'Close drawer');
    await waitForText(cdp, '미저장 변경을 버릴까요?');
    await clickText(cdp, '변경 버리기');
    await waitFor('error sheet closed and invoker restored', () => evaluate(cdp, '!document.querySelector(".server-manager-modal") && document.activeElement?.matches("[data-server-add-trigger]")'));
    await clickText(cdp, '서버 추가 또는 가져오기');
    await waitForEnabledClickableText(cdp, '직접 추가');
    await clickText(cdp, '직접 추가');
    await waitFor('reopened error sheet focus established', () => evaluate(cdp, '!!document.activeElement?.closest(".server-manager-modal")'));
    await waitForText(cdp, '서버 추가');
    await waitForText(cdp, 'Save server');
    const navigableBody = await bodyText(cdp);
    if (!navigableBody.includes('GPUWatcher') || !navigableBody.includes('Save server')) throw new Error('Helper failure left management/sidebar non-navigable');
    return { tempDataDir, tempHomeDir, nonRepoCwd, bridgeError, errorBody, errorScreenshot, navigableBody, runtimeAppPath: copy.runtimeAppPath, faultHelperPath, helperPath, isolatedCopyRemoved: true };
  } finally {
    await closeRun(cdp, child);
    if (faultHelperPath && originalMode !== undefined && existsSync(faultHelperPath)) await chmod(faultHelperPath, originalMode);
    await rm(tempDataDir, { recursive: true, force: true });
    await rm(tempHomeDir, { recursive: true, force: true });
    if (nonRepoCwd) await rm(path.dirname(nonRepoCwd), { recursive: true, force: true });
  }
}

export function sourceHelperIsExecutable(helperPath) {
  return existsSync(helperPath) && Boolean(statSync(helperPath).mode & 0o111);
}
