import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { CollectorProcess } from '../../lib/types';
import { DetailProcessList } from './DetailProcessList';

const process: CollectorProcess = {
  command: 'python train.py',
  cpuPercent: 12,
  gpuMemoryUsedMiB: 1024,
  gpuUtilizationPercent: 80,
  hostMemoryUsedMiB: 2048,
  pid: 4321,
  username: 'trainer'
};

describe('DetailProcessList Phase 7 accessibility defects', () => {
  it('P7-D007 names the GPU process table and scopes every column header', () => {
    render(<DetailProcessList processes={[process]} />);

    const table = screen.getByRole('table', { name: 'GPU processes' });
    const headers = within(table).getAllByRole('columnheader');

    expect(headers).toHaveLength(4);
    expect(headers.every((header) => header.getAttribute('scope') === 'col')).toBe(true);
  });
});
