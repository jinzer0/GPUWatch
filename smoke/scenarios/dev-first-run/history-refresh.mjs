import { assertNonBlank, clickNav, clickText, waitForEnabledClickableText } from '../../shared/dom.mjs';
import { screenshot } from '../../shared/cdp.mjs';
import { evidenceDir } from '../../shared/paths.mjs';

export async function runHistoryRefreshScenario(cdp, { smokeWaitForText, screenshots }) {
  await clickNav(cdp, 'Live Monitor');
  await smokeWaitForText(cdp, 'Stored GPU history');
  await smokeWaitForText(cdp, 'Refresh history');
  await waitForEnabledClickableText(cdp, 'Refresh history');
  await clickText(cdp, 'Refresh history');
  const historyBody = await smokeWaitForText(cdp, 'History refreshed');
  await assertNonBlank(cdp, 'History refresh');
  await screenshot(cdp, evidenceDir, 'task-14-history-refresh-history.png', (file) => screenshots.push(file));
  return historyBody;
}
