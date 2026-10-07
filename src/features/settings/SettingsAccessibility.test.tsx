import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useUiStore } from '../../lib/store';
import type { SshConfigImportResult } from '../../lib/types';
import { okBridgeResponse, setGpuWatcherBridge } from '../../test-utils/bridge';
import { renderWithQueryClient } from '../../test-utils/query';
import { SettingsScreen } from './SettingsScreen';

const invalidImportResult: SshConfigImportResult = {
  candidates: [
    {
      draft: {
        enabled: true,
        host: 'missing-user',
        id: null,
        name: 'Missing User',
        pollingIntervalSeconds: null,
        port: 22,
        sshKeyPath: null,
        username: ''
      },
      hostAlias: 'missing-user',
      hostname: null,
      warnings: []
    }
  ],
  warnings: []
};

const expectVisibleDescription = (control: HTMLElement, expectedText: string) => {
  const descriptionIds = control.getAttribute('aria-describedby')?.split(/\s+/) ?? [];
  expect(descriptionIds.length).toBeGreaterThan(0);
  const description = descriptionIds.map((id) => document.getElementById(id)).find((element) => element?.textContent?.includes(expectedText));
  expect(description).toBeDefined();
  expect(description?.hidden).not.toBe(true);
  expect(description?.getAttribute('aria-hidden')).not.toBe('true');
};

describe('Settings modal accessibility', () => {
  beforeEach(() => {
    useUiStore.setState({ selectedServerId: null });
    useUiStore.getState().openServerManager('add');
    setGpuWatcherBridge({
      listServers: vi.fn().mockResolvedValue(okBridgeResponse([])),
      listSshConfigHosts: vi.fn().mockResolvedValue(okBridgeResponse(invalidImportResult)),
      saveServer: vi.fn()
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  });

  it('P7-D009 opens import as a keyboard-operable modal without in-page smooth scrolling under reduced motion', async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn().mockReturnValue(true),
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn()
    } satisfies MediaQueryList)));
    useUiStore.getState().closeServerManager();
    const ImportEntry = () => (
      <>
        <button onClick={() => useUiStore.getState().openServerManager('import')} type="button">Import SSH config</button>
        <SettingsScreen />
      </>
    );
    renderWithQueryClient(<ImportEntry />);
    const invoker = screen.getByRole('button', { name: 'Import SSH config' });
    invoker.focus();
    fireEvent.click(invoker);
    const dialog = await screen.findByRole('dialog', { name: 'SSH config 가져오기' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close drawer' }));
    await screen.findByRole('button', { name: 'Import from SSH config' });
    expect(scrollIntoView).not.toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }));
    fireEvent.keyDown(document.activeElement ?? document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(invoker);
  });

  it('P7-D010 associates disabled editor and import actions with visible reason text in their own modes', async () => {
    renderWithQueryClient(<SettingsScreen />);
    await screen.findByText('Remote host requirements');
    const test = screen.getByRole('button', { name: 'Test SSH connection' });
    expect(test).toHaveProperty('disabled', true);
    expectVisibleDescription(test, 'Save this server before testing');
    act(() => useUiStore.getState().openServerManager('import'));
    fireEvent.click(await screen.findByRole('button', { name: 'Import from SSH config' }));
    await screen.findByText('SSH config import candidates');
    const selectAll = screen.getByRole('button', { name: 'Select all valid hosts' });
    const saveSelected = screen.getByRole('button', { name: 'Save selected hosts' });
    expect(selectAll).toHaveProperty('disabled', true);
    expect(saveSelected).toHaveProperty('disabled', true);
    expectVisibleDescription(selectAll, '0 of 0 valid hosts selected');
    expectVisibleDescription(saveSelected, '0 of 0 valid hosts selected');
    const invalidCandidate = screen.getByRole('checkbox', { name: 'Select missing-user for bulk import' });
    expect(invalidCandidate).toHaveProperty('disabled', true);
    expectVisibleDescription(invalidCandidate, 'Missing username');
    expect(screen.queryByLabelText('Name')).toBeNull();
  });

  it('keeps visible field errors associated with native form inputs inside the modal', async () => {
    renderWithQueryClient(<SettingsScreen />);
    await screen.findByLabelText('Name');
    fireEvent.change(screen.getByLabelText('SSH port'), { target: { value: '70000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save server' }));
    for (const [label, error] of [
      ['Name', 'Server name is required.'],
      ['Host', 'Host is required.'],
      ['Username', 'Username is required.'],
      ['SSH port', 'SSH port must be between 1 and 65535.']
    ]) {
      const input = screen.getByLabelText(label!);
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expectVisibleDescription(input, error!);
    }
    const name = screen.getByLabelText('Name');
    name.focus();
    fireEvent.change(name, { target: { value: 'Keyboard GPU' } });
    expect(document.activeElement).toBe(name);
    expect(name).toHaveProperty('value', 'Keyboard GPU');
  });
});
