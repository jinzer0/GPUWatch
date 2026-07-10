import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { evaluate } from './cdp.mjs';
import { waitFor } from './wait.mjs';

export async function bodyText(cdp) {
  return evaluate(cdp, 'document.body.innerText');
}

export async function waitForText(cdp, text, { evidenceDir, missingPrefix, timeoutMs = 15000 }) {
  try {
    return await waitFor(`text ${text}`, async () => {
      const textContent = await bodyText(cdp);
      return textContent.toLowerCase().includes(text.toLowerCase()) ? textContent : null;
    }, timeoutMs);
  } catch (error) {
    const safeName = text.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'text';
    const debugText = await evaluate(
      cdp,
      `(() => ({ url: location.href, readyState: document.readyState, bodyText: document.body.innerText, html: document.documentElement.outerHTML.slice(0, 12000) }))()`
    );
    await writeFile(path.join(evidenceDir, `${missingPrefix}-missing-${safeName}.json`), `${JSON.stringify(debugText, null, 2)}\n`);
    throw error;
  }
}

export async function clickText(cdp, text) {
  await evaluate(
    cdp,
    `(() => {
      const needle = ${JSON.stringify(text)};
      const element = Array.from(document.querySelectorAll('button, a')).find((candidate) =>
        candidate.textContent.trim().includes(needle) && (!('disabled' in candidate) || !candidate.disabled)
      );
      if (!element) throw new Error('No enabled clickable element with text: ' + needle);
      element.click();
      return true;
    })()`
  );
}

export async function waitForEnabledClickableText(cdp, text, timeoutMs = 15000) {
  return waitFor(`enabled clickable text ${text}`, async () => {
    return evaluate(
      cdp,
      `(() => {
        const needle = ${JSON.stringify(text)};
        const element = Array.from(document.querySelectorAll('button, a')).find((candidate) =>
          candidate.textContent.trim().includes(needle) && (!('disabled' in candidate) || !candidate.disabled)
        );
        return Boolean(element);
      })()`
    );
  }, timeoutMs);
}

export async function clickNav(cdp, text) {
  await evaluate(
    cdp,
    `(() => {
      const needle = ${JSON.stringify(text)};
      const element = Array.from(document.querySelectorAll('nav button')).find((candidate) =>
        candidate.textContent.trim() === needle && !candidate.disabled
      );
      if (!element) throw new Error('No enabled nav button with text: ' + needle);
      element.click();
      return true;
    })()`
  );
}

export async function selectByLabel(cdp, label, value) {
  await evaluate(
    cdp,
    `(() => {
      const labelText = ${JSON.stringify(label)};
      const labelNode = Array.from(document.querySelectorAll('label')).find((candidate) =>
        candidate.textContent.trim().startsWith(labelText)
      );
      if (!labelNode) throw new Error('No label found: ' + labelText);
      const select = labelNode.querySelector('select');
      if (!select) throw new Error('No select found for label: ' + labelText);
      select.value = ${JSON.stringify(value)};
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return select.value;
    })()`
  );
}

export async function setInputByLabel(cdp, label, value) {
  await evaluate(
    cdp,
    `(() => {
      const labelText = ${JSON.stringify(label)};
      const labelNode = Array.from(document.querySelectorAll('label')).find((candidate) =>
        candidate.textContent.trim().startsWith(labelText)
      );
      if (!labelNode) throw new Error('No label found: ' + labelText);
      const input = labelNode.querySelector('input');
      if (!input) throw new Error('No input found for label: ' + labelText);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`
  );
}

export async function setCheckboxByLabel(cdp, label, checked) {
  await evaluate(
    cdp,
    `(() => {
      const labelText = ${JSON.stringify(label)};
      const labelNode = Array.from(document.querySelectorAll('label')).find((candidate) =>
        candidate.textContent.trim().includes(labelText)
      );
      if (!labelNode) throw new Error('No checkbox label found: ' + labelText);
      const input = labelNode.querySelector('input[type="checkbox"]');
      if (!input) throw new Error('No checkbox found for label: ' + labelText);
      if (input.checked !== ${checked ? 'true' : 'false'}) {
        input.click();
      }
      return input.checked;
    })()`
  );
}

export async function bridgeListServers(cdp) {
  return evaluate(
    cdp,
    `window.gpuwatcher.listServers({}).then((response) => {
      if (!response.ok) throw new Error(response.error.message);
      return response.data;
    })`
  );
}

export async function bridgeHelperHealth(cdp) {
  return evaluate(cdp, 'window.gpuwatcher.helperHealth({})');
}

export async function assertNonBlank(cdp, label) {
  const text = await bodyText(cdp);
  const hasStableSurface = /GPUWatcher|Fleet snapshot|Server registry|Process Table|Stored GPU history/i.test(text);
  if (!hasStableSurface || text.trim().length === 0) {
    throw new Error(`${label} left the app blank or without shell identity.`);
  }
  return text;
}

export function assertNoSensitiveText(label, text) {
  const forbiddenPatterns = [/\/Users\/alice\/\.ssh\/id_ed25519/i, /raw-secret/i, /--token\s+\S+/i, /BEGIN OPENSSH PRIVATE KEY/i];
  const matched = forbiddenPatterns.find((pattern) => pattern.test(text));
  if (matched) {
    throw new Error(`${label} exposed sensitive text matching ${matched}.`);
  }
}

export async function visibleErrorText(cdp) {
  return evaluate(
    cdp,
    `(() => {
      const resultSurface = Array.from(document.querySelectorAll('.surface, [role="alert"]')).find((element) =>
        /ssh_unreachable|connection refused|helper|backend_unavailable|failed|error/i.test(element.textContent || '')
      );
      if (!resultSurface) return null;
      resultSurface.scrollIntoView({ block: 'center' });
      return resultSurface.textContent || '';
    })()`
  );
}
