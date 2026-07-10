import { assertNonBlank, clickNav, clickText, selectByLabel, waitForEnabledClickableText } from '../../shared/dom.mjs';
import { screenshot } from '../../shared/cdp.mjs';
import { evidenceDir } from '../../shared/paths.mjs';

export async function runProcessRefreshScenario(cdp, { smokeWaitForText, screenshots }) {
  await clickNav(cdp, 'Process Table');
  await smokeWaitForText(cdp, 'GPU memory ledger');
  await smokeWaitForText(cdp, 'Refresh rows');
  await selectByLabel(cdp, 'View', 'userGrouped');
  await smokeWaitForText(cdp, 'User grouped');
  await waitForEnabledClickableText(cdp, 'Refresh rows');
  await clickText(cdp, 'Refresh rows');
  const processBody = await smokeWaitForText(cdp, 'Refresh rows loaded');
  await assertNonBlank(cdp, 'Process Table refresh');
  await screenshot(cdp, evidenceDir, 'task-14-process-refresh-rows.png', (file) => screenshots.push(file));
  return processBody;
}
