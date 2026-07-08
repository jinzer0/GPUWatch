import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchJson, waitFor } from './wait.mjs';

export function cdpUrl(port) {
  return `http://127.0.0.1:${port}`;
}

export async function connectCdp({ port, description, pagePredicate, timeoutMs = 30000 }) {
  const pageInfo = await waitFor(description, async () => {
    const pages = await fetchJson(`${cdpUrl(port)}/json/list`);
    return pages.find(pagePredicate) ?? null;
  }, timeoutMs);

  const socket = new WebSocket(pageInfo.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data.toString());
    if (!message.id || !pending.has(message.id)) {
      return;
    }
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) {
      reject(new Error(message.error.message));
    } else {
      resolve(message.result);
    }
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });

  await send('Runtime.enable');
  await send('Page.enable');
  return { socket, send, pageInfo };
}

export async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    const message = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
    throw new Error(message);
  }
  return result.result.value;
}

export async function screenshot(cdp, evidenceDir, filename, onPath = () => {}) {
  const result = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const screenshotPath = path.join(evidenceDir, filename);
  await writeFile(screenshotPath, Buffer.from(result.data, 'base64'));
  onPath(screenshotPath);
  return screenshotPath;
}
