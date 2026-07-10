import { assertBridgeGuardrails, getBridgeInfo } from '../../shared/bridge.mjs';

export async function runBridgeGuardrails(cdp) {
  const bridgeInfo = await getBridgeInfo(cdp);
  const { electronMetaKeys } = assertBridgeGuardrails(bridgeInfo, 'Electron first-run smoke');
  return { bridgeInfo, electronMetaKeys };
}
