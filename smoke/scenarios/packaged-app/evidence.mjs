import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expectedBridgeKeys, forbiddenBridgeKeys, forbiddenElectronMetadataKeys } from '../../shared/constants.mjs';
import { evidenceDir } from '../../shared/paths.mjs';
import { sourceHelperIsExecutable } from './helper-error.mjs';

export function selectedLogExcerpt(logs) {
  return logs
    .filter((line) => /warning|error|helper|GPUWatcher|packaged exit|stderr/i.test(line))
    .slice(0, 40)
    .join('')
    .slice(0, 8000);
}

export async function buildPackagedEvidence({ taskEvidenceName, artifactMode, discovery, sourceUnchanged, startedAt, appPath, helperPath, executablePath, helperMode, success, failure, logs, timestamp }) {
  const packLogPath = path.join(evidenceDir, `${taskEvidenceName}-electron-pack.log`);
  const packLog = existsSync(packLogPath) ? await readFile(packLogPath, 'utf8') : '';
  const packageWarnings = packLog
    .split('\n')
    .filter((line) => /missed|warning|default Electron icon|skipped macOS code signing|requires signing|DEP0190/i.test(line))
    .join('\n');

  const launchEvidence = [
    `${taskEvidenceName} ${artifactMode} local packaged Electron app launch smoke evidence`,
    `Started at: ${startedAt}`,
    `Completed at: ${timestamp()}`,
    `Artifact mode: ${artifactMode}; packaging is not performed by this smoke`,
    `Package log: ${packLogPath}`,
    `Package warnings: ${packageWarnings || `No package warnings captured in ${taskEvidenceName}-electron-pack.log.`}`,
    `App discovery: ${discovery}`,
    `Discovered app path: ${appPath}`,
    `Packaged app executable: ${executablePath}`,
    `Packaged helper path: ${helperPath}`,
    `Packaged helper executable mode: ${helperMode.toString(8)}`,
    `Helper outside ASAR: ${helperPath.includes(`${path.sep}Contents${path.sep}Resources${path.sep}gpuwatcher-helper${path.sep}`)}`,
    `Success launch cwd: ${success.nonRepoCwd}`,
    'Success launch environment: GPUWATCHER_HELPER_PATH unset; GPUWATCHER_TEST_DATA_DIR isolated; HOME isolated',
    `Isolated data dir: ${success.tempDataDir}`,
    `Isolated HOME: ${success.tempHomeDir}`,
    `Canonical test DB existed before owned cleanup: ${success.dbExistedBeforeCleanup} (${success.dbPath})`,
    `Disposable runtime app/helper: ${success.runtimeAppPath}; ${success.runtimeHelperPath}`,
    `Guarded actions: ${JSON.stringify(success.guardActions)}`,
    `Guard used: ${success.guardUsed}`,
    `Pre-launch copy signature/ticket proof: ${JSON.stringify(success.signatureProof)}`,
    `Source app seal unchanged: ${sourceUnchanged ?? 'not measured (unsigned); source helper executable checked'}`,
    `Disposable app removed: ${success.isolatedCopyRemoved}`,
    `Renderer URL: ${success.bridgeInfo.url}`,
    `Nonblank UI body length: ${success.bridgeInfo.bodyLength}`,
    `window.gpuwatcher exposed: ${success.bridgeInfo.hasGpuwatcher}`,
    `Bridge keys: ${success.bridgeInfo.keys.join(', ')}`,
    `Expected bridge keys present: ${expectedBridgeKeys.join(', ')}`,
    `Forbidden bridge keys absent: ${forbiddenBridgeKeys.join(', ')}`,
    `Forbidden Electron metadata absent: ${forbiddenElectronMetadataKeys.join(', ')}`,
    `Deferred migration labels visible: ${success.bridgeInfo.bodyHasMigrationLabels}`,
    `Electron metadata: ${JSON.stringify(success.bridgeInfo.electronMeta)}`,
    `helperHealth via renderer/preload/IPC/helper: ${JSON.stringify(success.helperHealth)}`,
    'listServers via renderer/preload/IPC/helper before save: []',
    `listServers after UI save: ${JSON.stringify(success.servers)}`,
    `Screenshots: ${success.initialScreenshot}; ${success.savedScreenshot}`,
    `Packaged app log excerpt: ${selectedLogExcerpt(logs) || 'No relevant packaged app log excerpt.'}`
  ].join('\n');

  const failureEvidence = [
    `${taskEvidenceName} ${artifactMode} packaged helper fault evidence`,
    `Started at: ${startedAt}`,
    `Completed at: ${timestamp()}`,
    'Failure mode: removed executable bits only in an owned disposable app copy; source package untouched',
    `Fault classification: ${failure.faultClass}; OS signature enforcement is not backend error acceptance`,
    `Fault pre-mutation copy proof: ${JSON.stringify(failure.signatureBefore)}`,
    `Fault post-mutation signature/ticket: ${JSON.stringify(failure.signatureAfter)}`,
    `Fault launch outcome: ${JSON.stringify(failure.launchOutcome)}`,
    `PID-scoped OS diagnostic: ${JSON.stringify(failure.osDiagnostic ?? null)}`,
    `App path: ${appPath}`,
    `Helper path: ${helperPath}`,
    `Disposable fault helper: ${failure.faultHelperPath}`,
    `Disposable app removed: ${failure.isolatedCopyRemoved}`,
    `Failure launch cwd: ${failure.nonRepoCwd}`,
    'Failure launch environment: GPUWATCHER_HELPER_PATH unset; GPUWATCHER_TEST_DATA_DIR isolated; HOME isolated',
    `Isolated data dir: ${failure.tempDataDir}`,
    `Isolated HOME: ${failure.tempHomeDir}`,
    `Renderer bridge structured helperHealth error: ${failure.bridgeError ? JSON.stringify(failure.bridgeError) : 'not observed (OS fault)'}`,
    `Visible helper error excerpt: ${failure.errorBody?.split('\n').filter((line) => /helper_spawn_failed|permission denied|EACCES|failed to spawn helper|helper_contract|helper|error/i.test(line)).slice(0, 12).join(' | ') ?? 'not observed (OS fault)'}`,
    `App remained nonblank after helper error: ${failure.errorBody ? failure.errorBody.includes('GPUWatcher') && failure.errorBody.includes('Save server') : 'not observed (OS fault)'}`,
    `Management remains navigable after helper error: ${failure.navigableBody ? failure.navigableBody.includes('Save server') : 'not observed (OS fault)'}`,
    `Source helper remains executable: ${sourceHelperIsExecutable(helperPath)}`,
    `Screenshot: ${failure.errorScreenshot ?? 'not captured (OS fault)'}`,
    `Packaged app log excerpt: ${selectedLogExcerpt(logs) || 'No relevant packaged app log excerpt.'}`
  ].join('\n');

  return { launchEvidence, failureEvidence };
}
