import { existsSync, statSync } from 'node:fs';
import { chmod, realpath, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeCommand } from '../../../electron/signedRelease.mjs';
import { assertBridgeGuardrails, getBridgeInfo } from '../../shared/bridge.mjs';
import { evaluate, screenshot } from '../../shared/cdp.mjs';
import { bodyText, bridgeHelperHealth, clickText, setCheckboxByLabel, setInputByLabel, waitForEnabledClickableText } from '../../shared/dom.mjs';
import { createIsolatedDirs, createNonRepoCwd } from '../../shared/isolation.mjs';
import { evidenceDir } from '../../shared/paths.mjs';
import { closeRun } from '../../shared/processes.mjs';
import { waitFor } from '../../shared/wait.mjs';
import { commandSucceeded, connectPackagedCdp, createPackagedCopy, inspectPackagedSignature, launchPackagedApp, verifySignedPackagedCopy } from './startup.mjs';

export function classifyPackagedFault({ signatureAfter, launchOutcome, osDiagnostic, launchPid, launchStartedAt, launchEndedAt }) {
  const signature = signatureAfter?.codesign;
  const invalidSignature = signature && Number.isInteger(signature.code) && signature.code > 0 && signature.signal === null && signature.timedOut === false && typeof signature.stdout === 'string' && typeof signature.stderr === 'string' && /sealed resource|code signature.*invalid|invalid signature/i.test(`${signature.stdout}${signature.stderr}`);
  const exited = launchOutcome && ((launchOutcome.signal === 'SIGKILL' && launchOutcome.code === null) || (Number.isInteger(launchOutcome.code) && launchOutcome.code > 0 && launchOutcome.signal === null));
  // A kill or CDP timeout alone is not evidence of a code-signing enforcement decision.
  const start = Date.parse(launchStartedAt);
  const end = Date.parse(launchEndedAt);
  if (!invalidSignature || !exited || !commandSucceeded(osDiagnostic) || !Number.isInteger(launchPid) || launchPid <= 0 || !Number.isFinite(start) || !Number.isFinite(end) || end < start) return 'unresolved';
  let records;
  try { records = JSON.parse(osDiagnostic.stdout); } catch { return 'unresolved'; }
  if (!Array.isArray(records)) return 'unresolved';
  const pidPattern = new RegExp(`\\b(?:pid|process)\\s*[:=]?\\s*${launchPid}(?!\\d)`, 'i');
  const diagnostic = records.some(record => {
    const message = record?.eventMessage;
    const time = typeof record?.timestamp === 'string' ? Date.parse(record.timestamp) : NaN;
    return typeof message === 'string' && Number.isFinite(time) && time >= start && time <= end &&
      (record.processID === launchPid || pidPattern.test(message)) &&
      /code signature.*invalid|Termination Reason:.*CODESIGNING|CODESIGNING.*invalid page|signature validation failed|AMFI.*(denied|invalid|reject)/i.test(message);
  });
  return diagnostic ? 'os-signature-block' : 'unresolved';
}

export async function runPackagedHelperErrorScenario({ appPath, helperPath, logs, screenshots, spawnLogged, cdpPort, waitForText, timestamp, artifactMode = 'unsigned', evidencePrefix }) {
  const screenshotPrefix = evidencePrefix ?? (artifactMode === 'signed' ? 'task-31-signed' : 'task-29');
  const dirs = await createIsolatedDirs('gpuwatcher-task29-package-fault-', 'gpuwatcher-task29-package-fault-home-');
  let tempDataDir = dirs.tempDataDir;
  let tempHomeDir = dirs.tempHomeDir;
  let nonRepoCwd;
  let cdp;
  let child;
  let faultHelperPath;
  let originalMode;
  let signatureBefore = null;
  let signatureAfter = null;
  let launchOutcome = null;
  let launchPid;
  let launchStartedAt;
  let launchEndedAt;
  try {
    tempDataDir = await realpath(tempDataDir);
    tempHomeDir = await realpath(tempHomeDir);
    nonRepoCwd = await createNonRepoCwd('gpuwatcher task29 package fault cwd ');
    nonRepoCwd = await realpath(nonRepoCwd);
    const copy = await createPackagedCopy(appPath, tempDataDir);
    faultHelperPath = copy.runtimeHelperPath;
    if (artifactMode === 'signed') signatureBefore = await verifySignedPackagedCopy(appPath, copy.runtimeAppPath);
    originalMode = (await stat(faultHelperPath)).mode;
    // Fault injection affects only our disposable app copy, never release/electron.
    // No helper can execute, so neither collectors nor notification consumption run.
    await chmod(faultHelperPath, originalMode & ~0o111);
    if (artifactMode === 'signed') signatureAfter = await inspectPackagedSignature(copy.runtimeAppPath);
    launchStartedAt = new Date().toISOString();
    child = launchPackagedApp({ appPath: copy.runtimeAppPath, cwd: nonRepoCwd, dataDir: tempDataDir, port: cdpPort, extraEnv: { HOME: tempHomeDir }, logs, spawnLogged, timestamp });
    launchPid = child.pid;
    child.once('exit', (code, signal) => { launchOutcome = { code, signal }; });
    try {
      cdp = await connectPackagedCdp(cdpPort);
    } catch (error) {
      if (artifactMode !== 'signed') throw error;
      launchOutcome ??= { code: child.exitCode, signal: child.signalCode };
      launchEndedAt = new Date().toISOString();
      // PID-scoped, bounded, read-only OS diagnostics; never infer enforcement from SIGKILL alone.
      const osDiagnostic = Number.isInteger(child.pid) && child.pid > 0
        ? await executeCommand('/usr/bin/log', ['show', '--start', `${launchStartedAt.slice(0, 19).replace('T', ' ')}+0000`, '--end', `${launchEndedAt.slice(0, 19).replace('T', ' ')}+0000`, '--style', 'json', '--predicate', `processID == ${child.pid} OR eventMessage MATCHES[c] ".*(pid|process)[ :=]+${child.pid}([^0-9].*|$)"`], { timeout: 15000 })
        : null;
      const faultClass = classifyPackagedFault({ signatureAfter, launchOutcome, osDiagnostic, launchPid, launchStartedAt, launchEndedAt });
      if (faultClass !== 'os-signature-block') throw new Error(`Unresolved signed helper fault: ${JSON.stringify({ signatureBefore, signatureAfter, launchOutcome, osDiagnostic, error: error.message })}`);
      return { artifactMode, faultClass, signatureBefore, signatureAfter, launchOutcome, osDiagnostic, launchPid, launchStartedAt, launchEndedAt, tempDataDir, tempHomeDir, nonRepoCwd, runtimeAppPath: copy.runtimeAppPath, faultHelperPath, helperPath, isolatedCopyRemoved: true };
    }
    await waitForText(cdp, 'GPUWatcher', 45000);
    if (artifactMode === 'signed') {
      const info = await getBridgeInfo(cdp);
      assertBridgeGuardrails(info, 'signed fault app');
      if (fileURLToPath(info.url) !== path.join(copy.runtimeAppPath, 'Contents/Resources/app.asar/dist/index.html')) throw new Error('Signed fault CDP renderer does not belong to the verified disposable app');
    }
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
    const errorScreenshot = await screenshot(cdp, evidenceDir, `${screenshotPrefix}-packaged-helper-nonexec-error.png`, file => screenshots.push(file));
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
    return { artifactMode, faultClass: 'backend-error', signatureBefore, signatureAfter, launchOutcome, tempDataDir, tempHomeDir, nonRepoCwd, bridgeError, errorBody, errorScreenshot, navigableBody, runtimeAppPath: copy.runtimeAppPath, faultHelperPath, helperPath, isolatedCopyRemoved: true };
  } finally {
    try {
      await closeRun(cdp, child);
    } finally {
      try {
        if (faultHelperPath && originalMode !== undefined && existsSync(faultHelperPath)) await chmod(faultHelperPath, originalMode);
      } finally {
        await Promise.all([
          rm(tempDataDir, { recursive: true, force: true }),
          rm(tempHomeDir, { recursive: true, force: true }),
          ...(nonRepoCwd ? [rm(path.dirname(nonRepoCwd), { recursive: true, force: true })] : [])
        ]);
      }
    }
  }
}

export function sourceHelperIsExecutable(helperPath) {
  return existsSync(helperPath) && Boolean(statSync(helperPath).mode & 0o111);
}
