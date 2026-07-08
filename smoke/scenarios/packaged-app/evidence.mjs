import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expectedBridgeKeys, forbiddenBridgeKeys, forbiddenElectronMetadataKeys } from '../../shared/constants.mjs';
import { evidenceDir } from '../../shared/paths.mjs';
import { helperRestored } from './helper-error.mjs';

export function selectedLogExcerpt(logs) {
  return logs
    .filter((line) => /warning|error|helper|GPUWatcher|packaged exit|stderr/i.test(line))
    .slice(0, 40)
    .join('')
    .slice(0, 8000);
}

export async function buildPackagedEvidence({ taskEvidenceName, startedAt, appPath, helperPath, executablePath, helperMode, success, failure, logs, timestamp }) {
  const packLogPath = path.join(evidenceDir, `${taskEvidenceName}-electron-pack.log`);
  const packLog = existsSync(packLogPath) ? await readFile(packLogPath, 'utf8') : '';
  const packageWarnings = packLog
    .split('\n')
    .filter((line) => /missed|warning|default Electron icon|skipped macOS code signing|requires signing|DEP0190/i.test(line))
    .join('\n');

  const launchEvidence = [
    'Task 2 unsigned local packaged Electron app launch smoke evidence',
    `Started at: ${startedAt}`,
    `Completed at: ${timestamp()}`,
    'Package command: npm run electron:pack',
    `Package log: ${packLogPath}`,
    `Package warnings: ${packageWarnings || `No package warnings captured in ${taskEvidenceName}-electron-pack.log.`}`,
    'App discovery: recursive release/electron first match, equivalent to find release/electron -name GPUWatcher.app -type d -print -quit',
    `Discovered app path: ${appPath}`,
    `Packaged app executable: ${executablePath}`,
    `Packaged helper path: ${helperPath}`,
    `Packaged helper executable mode: ${helperMode.toString(8)}`,
    `Helper outside ASAR: ${helperPath.includes(`${path.sep}Contents${path.sep}Resources${path.sep}gpuwatcher-helper${path.sep}`)}`,
    `Success launch cwd: ${success.nonRepoCwd}`,
    'Success launch environment: GPUWATCHER_HELPER_PATH unset; GPUWATCHER_TEST_DATA_DIR isolated; HOME isolated',
    `Isolated data dir: ${success.tempDataDir}`,
    `Isolated HOME: ${success.tempHomeDir}`,
    `Canonical test DB exists: ${existsSync(success.dbPath)} (${success.dbPath})`,
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
    'Task 2 packaged helper resolution failure evidence',
    `Started at: ${startedAt}`,
    `Completed at: ${timestamp()}`,
    'Failure mode: temporarily chmod removed executable bits from packaged helper, then restored them',
    `App path: ${appPath}`,
    `Helper path: ${helperPath}`,
    `Failure launch cwd: ${failure.nonRepoCwd}`,
    'Failure launch environment: GPUWATCHER_HELPER_PATH unset; GPUWATCHER_TEST_DATA_DIR isolated; HOME isolated',
    `Isolated data dir: ${failure.tempDataDir}`,
    `Isolated HOME: ${failure.tempHomeDir}`,
    `Renderer bridge structured helperHealth error: ${JSON.stringify(failure.bridgeError)}`,
    `Visible helper error excerpt: ${failure.errorBody.split('\n').filter((line) => /helper_spawn_failed|permission denied|EACCES|failed to spawn helper|helper_contract|helper|error/i.test(line)).slice(0, 12).join(' | ')}`,
    `App remained nonblank after helper error: ${failure.errorBody.toLowerCase().includes('gpuwatcher v0.1') && failure.errorBody.toLowerCase().includes('server registry')}`,
    `Navigation after helper error: ${failure.navigableBody.toLowerCase().includes('fleet snapshot') || failure.navigableBody.toLowerCase().includes('server registry')}`,
    `Helper restored executable: ${helperRestored(helperPath)}`,
    `Screenshot: ${failure.errorScreenshot}`,
    `Packaged app log excerpt: ${selectedLogExcerpt(logs) || 'No relevant packaged app log excerpt.'}`
  ].join('\n');

  return { launchEvidence, failureEvidence };
}
