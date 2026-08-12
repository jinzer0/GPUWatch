import { evaluate, screenshot } from '../../shared/cdp.mjs';
import { clickText } from '../../shared/dom.mjs';
import { evidenceDir } from '../../shared/paths.mjs';
import { waitFor } from '../../shared/wait.mjs';

const gpuIndex = 0;
const gpuUuid = 'GPU-00000000-0000-0000-0000-000000000000';

async function listWatchRules(cdp, serverId) {
  return evaluate(
    cdp,
    `window.gpuwatcher.listWatchRules({ serverId: ${JSON.stringify(serverId)} }).then((response) => {
      if (!response.ok) throw new Error(response.error.message);
      return response.data;
    })`
  );
}

async function openSeededDetail(cdp, smokeWaitForText) {
  const alreadyOpen = await evaluate(cdp, `document.body.innerText.includes(${JSON.stringify(gpuUuid)})`);
  if (alreadyOpen) {
    return;
  }
  await smokeWaitForText(cdp, 'Task 14 Smoke Server Edited');
  await clickText(cdp, 'Task 14 Smoke Server Edited');
  await smokeWaitForText(cdp, 'Detail');
  await smokeWaitForText(cdp, gpuUuid);
}

async function assertWatchControl(cdp, label) {
  return evaluate(
    cdp,
    `(() => {
      const panel = Array.from(document.querySelectorAll('.detail-gpu-panel')).find((element) => element.textContent.includes(${JSON.stringify(gpuUuid)}));
      if (!panel) throw new Error('Seeded GPU card was not rendered');
      const descriptionId = panel.querySelector('button')?.getAttribute('aria-describedby');
      const description = descriptionId ? document.getElementById(descriptionId)?.textContent : '';
      if (!description?.includes('GPU 사용률')) throw new Error('Watch explanation was not linked to the GPU control');
      if (!panel.textContent.includes(${JSON.stringify(label)})) throw new Error('Expected GPU watch label: ' + ${JSON.stringify(label)});
      return true;
    })()`
  );
}

function assertSavedRule(rules, serverId) {
  const rule = rules.find((candidate) => candidate.gpuUuid === gpuUuid);
  if (!rule || rule.serverId !== serverId || rule.gpuIndex !== gpuIndex || !rule.enabled) {
    throw new Error(`Expected enabled seeded GPU watch, got ${JSON.stringify(rules)}`);
  }
  return rule;
}

export async function runWatchEnableScenario(cdp, { smokeWaitForText, screenshots }) {
  await openSeededDetail(cdp, smokeWaitForText);
  await assertWatchControl(cdp, 'Notify when available');
  await clickText(cdp, 'Notify when available');
  await smokeWaitForText(cdp, 'Watching');
  const serverId = await evaluate(cdp, 'window.gpuwatcher.listServers({}).then((response) => response.ok ? response.data[0].id : Promise.reject(new Error(response.error.message)))');
  const rule = assertSavedRule(await waitFor('saved GPU watch rule', async () => {
    const rules = await listWatchRules(cdp, serverId);
    return rules.length === 1 ? rules : null;
  }), serverId);
  const screenshotPath = await screenshot(cdp, evidenceDir, 'task-14-watch-enabled.png', (file) => screenshots.push(file));
  return { rule, screenshotPath, serverId };
}

export async function assertWatchPersistsAfterRelaunch(cdp, { smokeWaitForText, expectedWatch, screenshots }) {
  await smokeWaitForText(cdp, 'Fleet snapshot');
  await openSeededDetail(cdp, smokeWaitForText);
  await assertWatchControl(cdp, 'Watching');
  const rule = assertSavedRule(await listWatchRules(cdp, expectedWatch.serverId), expectedWatch.serverId);
  if (rule.id !== expectedWatch.rule.id) {
    throw new Error(`Watch rule changed across Electron relaunch: ${rule.id}`);
  }
  const screenshotPath = await screenshot(cdp, evidenceDir, 'task-14-watch-persisted-relaunch.png', (file) => screenshots.push(file));
  return { rule, screenshotPath };
}
