import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { assertNoSensitiveText, assertNonBlank, clickNav, clickText, visibleErrorText } from '../../shared/dom.mjs';
import { evaluate, screenshot } from '../../shared/cdp.mjs';
import { evidenceDir } from '../../shared/paths.mjs';
import { waitFor } from '../../shared/wait.mjs';

export async function runSanitizedErrorScenario(cdp, { smokeWaitForText, screenshots }) {
  await clickText(cdp, 'Task 14 Smoke Server Edited');
  await clickText(cdp, 'Test SSH connection');
  const errorSurface = await waitFor('visible SSH/helper error', async () => visibleErrorText(cdp), 120000).catch(async (error) => {
    const debugText = await evaluate(cdp, `(() => ({ url: location.href, readyState: document.readyState, bodyText: document.body.innerText, html: document.documentElement.outerHTML.slice(0, 12000) }))()`);
    await writeFile(path.join(evidenceDir, 'task-9-visible-error-timeout.json'), `${JSON.stringify(debugText, null, 2)}\n`);
    throw error;
  });
  assertNoSensitiveText('Visible SSH/backend error', errorSurface);
  await screenshot(cdp, evidenceDir, 'task-14-visible-error-path.png', (file) => screenshots.push(file));

  await clickNav(cdp, 'Overview');
  await smokeWaitForText(cdp, 'Fleet snapshot');
  await clickNav(cdp, 'Settings');
  await smokeWaitForText(cdp, 'Server registry');
  const afterErrorBody = await assertNonBlank(cdp, 'Navigation after sanitized error');

  return { errorSurface, afterErrorBody };
}
