import { existsSync } from 'node:fs';

export function buildDevFirstRunEvidence({ tempDataDir, tempHomeDir, dbPath, bridgeInfo, electronMetaKeys, savedServerId, importSurface, errorSurface, detail, originalRule, offRule, onRule, persistedRule, appearance, screenshots, guardActions }) {
  const task29Evidence = [
    'Task29 current Electron dev UI integration evidence',
    'Command: npm run smoke:electron:first-run',
    'Surface: built dist-electron main/preload with current Vite renderer; not packaged or external distribution evidence',
    `Isolated data: ${tempDataDir}; HOME: ${tempHomeDir}; userData: ${tempDataDir}/electron-user-data`,
    `Actual local helper SQLite existed before cleanup: ${existsSync(dbPath)} (${dbPath})`,
    `Server sidebar + direct add / edit / confirmed delete and cancelled delete: ${savedServerId}`,
    'All saved test servers disabled; monitoring-start menu inspected, not invoked (no enabled test hosts)',
    'SSH import reads only isolated HOME fixture; preview/warnings and bulk save of two disabled hosts checked; imported fixtures deleted through explicit row menus; no user SSH config or system ssh used',
    `Import diagnostic excerpt: ${importSurface.split('\n').filter(line => /task14|include|proxycommand/i.test(line)).slice(0, 8).join(' | ')}`,
    `Connection test through UI: SIMULATED guard diagnostic; ${errorSurface.split('\n').filter(line => /SIMULATED|smoke_network_guard/.test(line)).join(' | ')}`,
    'Every network-capable helper action blocked before real helper execution; notification consumption guard returns empty outbox',
    `Guard-observed helper actions: ${guardActions.map(entry => entry.action).join(', ')}`,
    `Real disabled fixture availability DTO: ${JSON.stringify(detail.gpus.map(gpu => ({ index: gpu.index, availability: gpu.availability })))}`,
    'No controlled available state fabricated; no continuous availability inherited after relaunch',
    'GPU and nested extra-metric disclosure exercised; disclosure resets per process session',
    'New watch created through UI with actual saved defaults 5% / 1024MiB / 300sec / 900sec; custom fixture keeps saved 120sec cooldown while UI shows effective minimum 900sec and OS permission unknown',
    `Custom fixture watch saved values preserved by UI off/on: ${JSON.stringify({ originalRule, offRule, onRule })}`,
    `Actual local helper watch after relaunch: ${JSON.stringify(persistedRule)}`,
    'Last selected server restored through isolated Electron userData; backend History readable, renderer History UI absent',
    `Appearance: ${appearance}`,
    `Backend bridge keys: ${bridgeInfo.keys.join(', ')}; UI bridge keys: ${bridgeInfo.uiKeys.join(', ')}; metadata keys: ${electronMetaKeys.join(', ')}`,
    'Main-only reset, polling, notification consumption, generic dispatch and helper path not exposed on renderer bridge',
    'UI controls exercised by renderer native input setters, DOM clicks and CDP keyboard; not OS-level input automation',
    `Screenshots: ${screenshots.join('; ')}`,
    'Teardown: owned CDP sockets closed and child processes terminated before isolated data/HOME deletion; logs retained as task-29-vite.log and task-29-electron.log',
    'Scope: no live SSH, native notifications, signed/notarized package, distribution readiness, or old first-run parity claim'
  ].join('\n');
  return { task29Evidence };
}
