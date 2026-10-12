import {
  expectedBridgeKeys,
  expectedElectronMetadataKeys,
  forbiddenBridgeKeys,
  forbiddenElectronMetadataKeys
} from './constants.mjs';
import { evaluate } from './cdp.mjs';
import { chmod, writeFile } from 'node:fs/promises';

// Local reads/writes use the real helper; collectors are rejected before SSH
// can run, and outbox consumption cannot reach an OS notification notifier.
export async function writeGuardedHelper(guardPath, realHelper, guardLog) {
  await writeFile(guardPath, `#!${process.execPath}\nconst fs = require('node:fs');\nconst { spawnSync } = require('node:child_process');\nlet input = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', c => input += c); process.stdin.on('end', () => {\nconst request = JSON.parse(input); fs.appendFileSync(${JSON.stringify(guardLog)}, JSON.stringify({action: request.action}) + '\\n');\nif (['test_connection','refresh_server','poll_due_servers'].includes(request.action)) { process.stdout.write(JSON.stringify({ok:false,error:{layer:'transport_ssh',type:'smoke_network_guard',message:'SIMULATED Task29 network blocked before SSH'}})); return; }\nif (request.action === 'consume_notification_events') { process.stdout.write(JSON.stringify({ok:true,data:[]})); return; }\nconst result = spawnSync(${JSON.stringify(realHelper)}, [], {input,env:process.env,encoding:'utf8'}); if(result.stderr) process.stderr.write(result.stderr); if(result.error) { process.stderr.write(String(result.error)); process.exitCode=1; return; } process.stdout.write(result.stdout); process.exitCode=result.status ?? 1;\n});\n`);
  await chmod(guardPath, 0o700);
}

export async function getBridgeInfo(cdp) {
  return evaluate(
    cdp,
    `(() => {
      const keys = Object.keys(window.gpuwatcher ?? {}).sort();
      return {
        hasGpuwatcher: Boolean(window.gpuwatcher),
        keys,
        forbidden: ${JSON.stringify(forbiddenBridgeKeys)}.filter((key) => keys.includes(key)),
        hasGenericDispatch: keys.some((key) => /invoke|runAction|dispatch|pollDueServers|poll_due_servers|helperPath|reset.*availability|consume.*notification/i.test(key)),
        uiKeys: Object.keys(window.gpuwatcherUi ?? {}).sort(),
        hasHistoryUi: Array.from(document.querySelectorAll('nav button')).some(button => /^(Fleet|Processes|History)$/.test((button.getAttribute('aria-label') || button.textContent).trim())) || /Stored GPU history|Refresh history/.test(document.body.innerText),
        bodyHasMigrationLabels: /migration|deferred migration/i.test(document.body.innerText),
        electronMeta: window.gpuWatcherElectron ? { ...window.gpuWatcherElectron } : null,
        bodyLength: document.body.innerText.trim().length,
        url: location.href
      };
    })()`
  );
}

export function assertBridgeGuardrails(info, label) {
  if (!info.hasGpuwatcher) {
    throw new Error(`window.gpuwatcher was not exposed${label ? ` in ${label}` : ''}.`);
  }
  if (info.bodyLength === 0) {
    throw new Error(`${label || 'Electron app'} rendered blank UI.`);
  }
  if (info.forbidden.length > 0 || info.hasGenericDispatch) {
    throw new Error(`Forbidden bridge exposure found: ${info.forbidden.join(', ')}`);
  }
  if (info.bodyHasMigrationLabels) {
    throw new Error('Deferred migration labels were visible.');
  }
  if (info.hasHistoryUi) throw new Error('Removed renderer History UI is visible.');
  const uiKeys = ['getAppearance', 'onAppearanceChanged', 'openSettings', 'setAppearance'];
  if (JSON.stringify(info.uiKeys) !== JSON.stringify(uiKeys)) throw new Error(`Unexpected UI bridge: ${info.uiKeys}`);
  const electronMetaKeys = Object.keys(info.electronMeta ?? {}).sort();
  const forbiddenMetaKeys = forbiddenElectronMetadataKeys.filter((key) => electronMetaKeys.includes(key));
  if (forbiddenMetaKeys.length > 0) {
    throw new Error(`Forbidden Electron metadata keys exposed: ${forbiddenMetaKeys.join(', ')}`);
  }
  const unexpectedMetaKeys = electronMetaKeys.filter((key) => !expectedElectronMetadataKeys.includes(key));
  if (unexpectedMetaKeys.length > 0) {
    throw new Error(`Unexpected Electron metadata keys exposed: ${unexpectedMetaKeys.join(', ')}`);
  }
  const missingBridgeKeys = expectedBridgeKeys.filter((key) => !info.keys.includes(key));
  if (missingBridgeKeys.length > 0) {
    throw new Error(`Missing expected bridge methods: ${missingBridgeKeys.join(', ')}`);
  }
  return { electronMetaKeys };
}
