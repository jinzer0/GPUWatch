import { bridgeListServers, clickNav, clickText } from '../../shared/dom.mjs';
import { screenshot } from '../../shared/cdp.mjs';
import { evidenceDir } from '../../shared/paths.mjs';
import { waitFor } from '../../shared/wait.mjs';

export async function runSettingsCleanupScenario(cdp, { smokeWaitForText, screenshots }) {
  await clickNav(cdp, 'Settings');
  await smokeWaitForText(cdp, 'Server registry');
  await clickText(cdp, 'Delete');
  await waitFor('deleted server list', async () => {
    const listed = await bridgeListServers(cdp);
    return listed.length === 0 ? listed : null;
  });
  await smokeWaitForText(cdp, 'No servers');
  await screenshot(cdp, evidenceDir, 'task-14-electron-first-run-settings-deleted.png', (file) => screenshots.push(file));
}
