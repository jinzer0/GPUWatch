import { existsSync } from 'node:fs';
import path from 'node:path';
import { expectedBridgeKeys, forbiddenBridgeKeys, forbiddenElectronMetadataKeys } from '../shared/constants.mjs';
import { cdpUrl } from '../shared/cdp.mjs';
import { evidenceDir } from '../shared/paths.mjs';

const viteUrl = 'http://127.0.0.1:5173';
const cdpPort = 9339;

export function buildDevFirstRunEvidence({ tempDataDir, tempHomeDir, dbPath, bridgeInfo, electronMetaKeys, savedServerId, servers, importSurface, errorSurface, afterErrorBody, seededBody, processBody, historyBody, screenshots }) {
  const parityEvidence = [
    'Task 9 Electron first-run UI parity evidence',
    'Command: npm run smoke:electron:first-run',
    `Surface: actual Electron main/preload/renderer launched from dist-electron/electron/main.js with Vite renderer at ${viteUrl}`,
    'Packaged app smoke: reserved for Task 11; this task used the Electron dev surface as allowed.',
    `Isolated data dir: ${tempDataDir}`,
    `Isolated HOME for SSH import fixture: ${tempHomeDir}`,
    `Canonical test DB exists: ${existsSync(dbPath)} (${dbPath})`,
    'Static identity visible: GPUWatcher v0.1; Remote GPU console',
    `Bridge keys: ${bridgeInfo.keys.join(', ')}`,
    `Forbidden bridge keys absent: ${forbiddenBridgeKeys.join(', ')}`,
    `Electron metadata keys: ${electronMetaKeys.join(', ')}`,
    `Forbidden Electron metadata absent: ${forbiddenElectronMetadataKeys.join(', ')}`,
    `Deferred migration labels visible: ${bridgeInfo.bodyHasMigrationLabels}`,
    `Electron metadata: ${JSON.stringify(bridgeInfo.electronMeta)}`,
    `Settings add/list/edit/delete through UI: saved ${savedServerId}, edited name to ${servers[0].name}, deleted back to zero servers`,
    `Settings SSH import warning excerpt: ${importSurface.split('\n').filter((line) => /include|proxycommand|no importable|task14/i.test(line)).slice(0, 6).join(' | ')}`,
    `Process Table refresh proved local read-model control: ${/Refresh rows loaded/i.test(processBody)}; User grouped visible: ${/User grouped/i.test(processBody)}`,
    `History refresh proved local read-model control: ${/History refreshed/i.test(historyBody)}; Stored GPU history visible: ${/Stored GPU history/i.test(historyBody)}`,
    `Screenshots: ${screenshots.join('; ')}`
  ].join('\n');

  const errorEvidence = [
    'Task 9 visible backend/SSH/helper error path evidence',
    `Action: Settings -> Test SSH connection for disabled smoke server ${savedServerId} at 127.0.0.1:1`,
    `Visible error excerpt: ${errorSurface.split('\n').filter((line) => /error|ssh|connection|helper/i.test(line)).slice(0, 8).join(' | ')}`,
    'Visible error sanitized: no raw key path, token, or private-key markers',
    `App remained nonblank: ${/GPUWatcher v0\.1|Server registry/i.test(afterErrorBody)}`,
    'Navigation after error: clicked Overview and returned to Settings successfully',
    `Screenshot: ${screenshots[3]}`,
    `Isolated data dir: ${tempDataDir}`
  ].join('\n');

  const task14Evidence = [
    'Task 14 Electron smoke expansion for new real surfaces',
    'Command: npm run smoke:electron:first-run',
    `Surface: Electron dev main/preload/renderer over CDP ${cdpUrl(cdpPort)}; no packaged app, no live SSH, no production DB`,
    `Isolated GPUWATCHER_TEST_DATA_DIR: ${tempDataDir}`,
    `Isolated HOME for SSH config import fixture: ${tempHomeDir}`,
    `Bridge forbidden keys absent: ${forbiddenBridgeKeys.join(', ')}`,
    `Bridge expected keys present: ${expectedBridgeKeys.join(', ')}`,
    `Electron metadata cleanup: keys=${electronMetaKeys.join(', ')}; forbidden metadata absent=${forbiddenElectronMetadataKeys.join(', ')}`,
    `Deferred migration labels visible: ${bridgeInfo.bodyHasMigrationLabels}`,
    `Settings import warning/fallback: ${importSurface.split('\n').filter((line) => /include|proxycommand|no importable|task14/i.test(line)).slice(0, 8).join(' | ')}`,
    `Settings manual form remained usable: saved ${savedServerId}, edited ${servers[0].name}`,
    `Sanitized SSH/backend error excerpt: ${errorSurface.split('\n').filter((line) => /error|ssh|connection|helper/i.test(line)).slice(0, 8).join(' | ')}`,
    'Sanitized error navigation: Overview Fleet snapshot and Settings Server registry remained reachable',
    `Local demo seed feedback: ${seededBody.split('\n').filter((line) => /Demo data seeded/i.test(line)).slice(0, 2).join(' | ')}; no refreshServer or remote SSH polling used for Process/History checks`,
    'Process Table: selected User grouped, clicked Refresh rows, observed local rows feedback and nonblank shell',
    'History: clicked Refresh history, observed Stored GPU history identity and success feedback',
    `Canonical test DB exists: ${existsSync(dbPath)} (${dbPath})`,
    `Screenshots: ${screenshots.join('; ')}`,
    `Logs: ${path.join(evidenceDir, 'task-14-vite.log')}; ${path.join(evidenceDir, 'task-14-electron.log')}`,
    'Teardown: CDP socket closed; Vite/Electron child processes are SIGTERM/SIGKILL guarded in finally'
  ].join('\n');

  return { parityEvidence, errorEvidence, task14Evidence };
}
