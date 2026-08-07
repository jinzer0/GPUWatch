import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listProcesses, refreshServer } from '../../lib/api';
import { processTableRows } from '../../test-utils/process-fixtures';
import { renderWithQueryClient } from '../../test-utils/query';
import { ProcessTableScreen } from './ProcessTableScreen';

vi.mock('../../lib/api', () => ({
  listProcesses: vi.fn(),
  queryKeys: { processes: ['processes'] },
  refreshServer: vi.fn()
}));

describe('Process Table Phase 7 accessibility defects', () => {
  beforeEach(() => {
    vi.mocked(listProcesses).mockReset();
    vi.mocked(refreshServer).mockReset();
    vi.mocked(listProcesses).mockResolvedValue(processTableRows);
  });

  it('P7-D006 exposes the process row selected state while its drawer is open', async () => {
    renderWithQueryClient(<ProcessTableScreen />);
    const row = await screen.findByRole('row', { name: /open process details for pid 1001/i });

    fireEvent.keyDown(row, { key: 'Enter' });

    expect(row.getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Close drawer' }));
    expect(row.hasAttribute('aria-selected')).toBe(false);
  });

  it('P7-D007 gives the process data table a direct accessible name', async () => {
    renderWithQueryClient(<ProcessTableScreen />);

    expect(await screen.findByRole('table', { name: 'Process rows ledger' })).toBeDefined();
  });
});
