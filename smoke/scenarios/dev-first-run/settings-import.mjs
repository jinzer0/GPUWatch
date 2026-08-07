import { assertNoSensitiveText, bridgeListServers, clickText, setCheckboxByLabel, setInputByLabel } from '../../shared/dom.mjs';
import { evaluate, screenshot } from '../../shared/cdp.mjs';
import { evidenceDir } from '../../shared/paths.mjs';
import { waitFor } from '../../shared/wait.mjs';

const importWorkspaceSelector = '[aria-labelledby="ssh-config-import-heading"]';

async function clickButtonByExactName(cdp, name, { withinSelector } = {}) {
  await evaluate(
    cdp,
    `(() => {
      const name = ${JSON.stringify(name)};
      const withinSelector = ${JSON.stringify(withinSelector ?? null)};
      const scope = withinSelector ? document.querySelector(withinSelector) : document;
      if (!scope) throw new Error('Button scope missing: ' + withinSelector);
      const button = Array.from(scope.querySelectorAll('button')).find((candidate) => {
        const accessibleName = candidate.getAttribute('aria-label') || candidate.textContent.trim();
        return accessibleName === name && !candidate.disabled;
      });
      if (!button) throw new Error('No enabled button named: ' + name);
      button.click();
      return true;
    })()`
  );
}

async function assertImportWorkspaceOutsideEditorForm(cdp) {
  return evaluate(
    cdp,
    `(() => {
      const importWorkspace = document.querySelector(${JSON.stringify(importWorkspaceSelector)});
      if (!importWorkspace) throw new Error('SSH config import workspace missing');
      const editorForm = document.querySelector('form.settings-editor');
      if (!editorForm) throw new Error('Settings editor form missing');
      if (editorForm.contains(importWorkspace)) {
        throw new Error('SSH config import workspace is inside the settings editor form');
      }
      return true;
    })()`
  );
}

async function verifyHeaderImportShortcut(cdp) {
  await clickButtonByExactName(cdp, 'Import SSH config');
  const shortcutResult = await evaluate(
    cdp,
    `(() => {
      const importHeading = document.getElementById('ssh-config-import-heading');
      if (!importHeading) throw new Error('SSH config import heading missing');
      const importWorkspace = document.querySelector(${JSON.stringify(importWorkspaceSelector)});
      if (!importWorkspace) throw new Error('SSH config import workspace missing');
      const candidatesVisible = /SSH config import candidates/i.test(importWorkspace.textContent || '');
      return {
        activeElementId: document.activeElement?.id || '',
        candidatesVisible
      };
    })()`
  );
  if (shortcutResult.activeElementId !== 'ssh-config-import-heading') {
    throw new Error(`Expected header import shortcut to focus ssh-config-import-heading, got: ${shortcutResult.activeElementId}`);
  }
  if (shortcutResult.candidatesVisible) {
    throw new Error('Header import shortcut triggered SSH config scan instead of only focusing the import workspace');
  }
}

async function importUnavailableEvidence(cdp, smokeWaitForText) {
  await assertImportWorkspaceOutsideEditorForm(cdp);
  await verifyHeaderImportShortcut(cdp);
  await clickButtonByExactName(cdp, 'Import from SSH config', { withinSelector: importWorkspaceSelector });
  await smokeWaitForText(cdp, 'SSH config import candidates');
  await smokeWaitForText(cdp, 'No importable SSH host aliases found').catch(() => smokeWaitForText(cdp, 'task14-import-warning'));
  const importSurface = await evaluate(
    cdp,
    `(() => {
      const element = document.querySelector(${JSON.stringify(importWorkspaceSelector)});
      if (!element) throw new Error('SSH config import surface missing');
      return element.textContent || '';
    })()`
  );
  if (!/Include skipped|unsupported ProxyCommand|No importable SSH host aliases found|task14-import-warning/i.test(importSurface)) {
    throw new Error(`Expected sanitized SSH import warning or fallback state, got: ${importSurface}`);
  }
  assertNoSensitiveText('Settings SSH import surface', importSurface);
  await setInputByLabel(cdp, 'Name', 'Task 14 Smoke Server');
  await setInputByLabel(cdp, 'Host', '127.0.0.1');
  await setInputByLabel(cdp, 'SSH port', '1');
  await setInputByLabel(cdp, 'Username', 'gpuwatcher-smoke');
  await setInputByLabel(cdp, 'SSH key path', '');
  await setInputByLabel(cdp, 'Polling interval seconds', '30');
  await setCheckboxByLabel(cdp, 'Enabled', false);
  return importSurface;
}

export async function runSettingsImportScenario(cdp, { smokeWaitForText, screenshots }) {
  await smokeWaitForText(cdp, 'Server registry');
  const importSurface = await importUnavailableEvidence(cdp, smokeWaitForText);
  await screenshot(cdp, evidenceDir, 'task-14-settings-import-warning.png', (file) => screenshots.push(file));
  await clickText(cdp, 'Save server');
  await smokeWaitForText(cdp, 'Task 14 Smoke Server');
  let servers = await waitFor('saved server list', async () => {
    const listed = await bridgeListServers(cdp);
    return listed.length === 1 && listed[0].name === 'Task 14 Smoke Server' ? listed : null;
  });
  const savedServerId = servers[0].id;
  await screenshot(cdp, evidenceDir, 'task-14-electron-first-run-settings-saved.png', (file) => screenshots.push(file));

  await setInputByLabel(cdp, 'Name', 'Task 14 Smoke Server Edited');
  await clickText(cdp, 'Save server');
  await smokeWaitForText(cdp, 'Task 14 Smoke Server Edited');
  servers = await waitFor('edited server list', async () => {
    const listed = await bridgeListServers(cdp);
    return listed.length === 1 && listed[0].id === savedServerId && listed[0].name === 'Task 14 Smoke Server Edited' ? listed : null;
  });

  return { importSurface, savedServerId, servers };
}
