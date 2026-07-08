import {
  expectedBridgeKeys,
  expectedElectronMetadataKeys,
  forbiddenBridgeKeys,
  forbiddenElectronMetadataKeys
} from './constants.mjs';
import { evaluate } from './cdp.mjs';

export async function getBridgeInfo(cdp) {
  return evaluate(
    cdp,
    `(() => {
      const keys = Object.keys(window.gpuwatcher ?? {}).sort();
      return {
        hasGpuwatcher: Boolean(window.gpuwatcher),
        keys,
        forbidden: ${JSON.stringify(forbiddenBridgeKeys)}.filter((key) => keys.includes(key)),
        hasGenericDispatch: keys.some((key) => /invoke|runAction|dispatch|pollDueServers|poll_due_servers|helperPath/i.test(key)),
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
