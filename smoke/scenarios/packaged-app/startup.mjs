import { constants, existsSync } from 'node:fs';
import { access, cp, readFile, realpath, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeCommand, sealApp } from '../../../electron/signedRelease.mjs';
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
  const runtimeAppPath = path.join(await realpath(dataDir), 'GPUWatcher.app');
  await cp(appPath, runtimeAppPath, { recursive: true, verbatimSymlinks: true });
  return { runtimeAppPath, runtimeHelperPath: helperPathForApp(runtimeAppPath) };
}

export async function inspectPackagedSignature(appPath) {
  const codesign = await executeCommand('codesign', ['--verify', '--deep', '--strict', appPath], { timeout: 120000 });
  const stapler = await executeCommand('xcrun', ['stapler', 'validate', appPath], { timeout: 120000 });
  return { codesign, stapler };
}

export function commandSucceeded(result) {
  return result?.code === 0 && result.signal === null && result.timedOut === false && typeof result.stdout === 'string' && typeof result.stderr === 'string';
}

export async function verifySignedPackagedCopy(appPath, runtimeAppPath) {
  const source = await sealApp(appPath);
  const copy = await sealApp(runtimeAppPath);
  if (source.sha256 !== copy.sha256) throw new Error('Signed packaged copy seal differs from source');
  const signature = await inspectPackagedSignature(runtimeAppPath);
  if (!commandSucceeded(signature.codesign) || !commandSucceeded(signature.stapler)) throw new Error(`Signed packaged copy signature/ticket verification failed: ${JSON.stringify(signature)}`);
  return { sourceSealSha256: source.sha256, copySealSha256: copy.sha256, ...signature };
}

export async function runPackagedStartupScenario({ appPath, helperPath, logs, screenshots, spawnLogged, cdpPort, waitForText, timestamp, artifactMode = 'unsigned', evidencePrefix }) {
  const screenshotPrefix = evidencePrefix ?? (artifactMode === 'signed' ? 'task-31-signed' : 'task-29');
  const dirs = await createIsolatedDirs('gpuwatcher-task29-package-', 'gpuwatcher-task29-package-home-');
  let tempDataDir = dirs.tempDataDir;
  let tempHomeDir = dirs.tempHomeDir;
  let nonRepoCwd;
  let child;
  let cdp;
  let runtimeHelperPath;
  let realHelper;
  try {
    tempDataDir = await realpath(tempDataDir);
    tempHomeDir = await realpath(tempHomeDir);
    nonRepoCwd = await createNonRepoCwd('gpuwatcher task29 package cwd ');
    nonRepoCwd = await realpath(nonRepoCwd);
    const copy = await createPackagedCopy(appPath, tempDataDir);
    runtimeHelperPath = copy.runtimeHelperPath;
    const guardLog = path.join(tempDataDir, 'packaged-guard.jsonl');
    let signatureProof = null;
    if (artifactMode === 'signed') {
      signatureProof = await verifySignedPackagedCopy(appPath, copy.runtimeAppPath);
    } else {
      realHelper = `${runtimeHelperPath}.real`;
      await rename(runtimeHelperPath, realHelper);
      await writeGuardedHelper(runtimeHelperPath, realHelper, guardLog);
    }
    child = launchPackagedApp({ appPath: copy.runtimeAppPath, cwd: nonRepoCwd, dataDir: tempDataDir, port: cdpPort, extraEnv: { HOME: tempHomeDir }, logs, spawnLogged, timestamp });
    cdp = await connectPackagedCdp(cdpPort);
    await waitForText(cdp, 'GPUWatcher', 45000);
    await waitForText(cdp, '등록된 서버가 없습니다');
    const initialScreenshot = await screenshot(cdp, evidenceDir, `${screenshotPrefix}-packaged-sidebar-initial.png`, file => screenshots.push(file));
    const info = await getBridgeInfo(cdp);
    assertBridgeGuardrails(info, 'packaged app');
    if (!info.url.startsWith('file:')) throw new Error('Packaged app used a dev renderer fallback');
    if (artifactMode === 'signed' && fileURLToPath(info.url) !== path.join(copy.runtimeAppPath, 'Contents/Resources/app.asar/dist/index.html')) throw new Error('Signed CDP renderer does not belong to the verified disposable app');
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
    const savedScreenshot = await screenshot(cdp, evidenceDir, `${screenshotPrefix}-packaged-sidebar-saved.png`, file => screenshots.push(file));
    const dbPath = canonicalDbPath(tempDataDir);
    const guardActions = artifactMode === 'unsigned' ? (await readFile(guardLog, 'utf8')).trim().split('\n').map(line => JSON.parse(line)) : [];
    return { artifactMode, guardUsed: artifactMode === 'unsigned', signatureProof, tempDataDir, tempHomeDir, nonRepoCwd, dbPath, dbExistedBeforeCleanup: existsSync(dbPath), initialScreenshot, savedScreenshot, bridgeInfo: info, helperHealth, servers, helperPath, appPath, runtimeAppPath: copy.runtimeAppPath, runtimeHelperPath, guardActions, isolatedCopyRemoved: true };
  } finally {
    try {
      await closeRun(cdp, child);
    } finally {
      try {
        if (realHelper && existsSync(realHelper)) {
          await rm(runtimeHelperPath, { force: true });
          await rename(realHelper, runtimeHelperPath);
        }
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
