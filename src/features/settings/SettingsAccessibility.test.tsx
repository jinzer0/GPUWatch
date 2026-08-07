import { fireEvent, screen } from '@testing-library/react';
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
  expect(descriptionIds.some((id) => document.getElementById(id)?.textContent?.includes(expectedText))).toBe(true);
};

describe('Settings Phase 7 accessibility defects', () => {
  beforeEach(() => {
    useUiStore.setState({ editingServerId: null, selectedServerId: null });
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

  it('P7-D009 avoids smooth scrolling when reduced motion is requested', async () => {
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
    renderWithQueryClient(<SettingsScreen />);
    await screen.findByText('Remote host requirements');

    fireEvent.click(screen.getByRole('button', { name: 'Import SSH config' }));

    expect(document.activeElement).toBe(screen.getByText('SSH config import'));
    expect(scrollIntoView).not.toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }));
  });

  it('P7-D010 associates disabled Settings actions with their visible reason text', async () => {
    renderWithQueryClient(<SettingsScreen />);
    await screen.findByText('Remote host requirements');

    expectVisibleDescription(screen.getByRole('button', { name: 'Test SSH connection' }), 'Save this server before testing');
    fireEvent.click(screen.getByRole('button', { name: 'Import from SSH config' }));
    await screen.findByText('SSH config import candidates');

    expectVisibleDescription(screen.getByRole('button', { name: 'Select all valid hosts' }), '0 of 0 valid hosts selected');
    expectVisibleDescription(screen.getByRole('button', { name: 'Save selected hosts' }), '0 of 0 valid hosts selected');
  });
});
