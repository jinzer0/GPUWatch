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

describe('DetailProcessList', () => {
  it('names the focusable scroll region and scopes the ordered table columns', () => {
    render(<DetailProcessList processes={[process]} />);

    const region = screen.getByRole('region', { name: 'GPU 프로세스 목록' });
    const table = within(region).getByRole('table', { name: 'GPU 프로세스' });
    const headers = within(table).getAllByRole('columnheader');

    expect(region.getAttribute('tabindex')).toBe('0');
    expect(region.classList.contains('overflow-x-auto')).toBe(true);
    expect(region.classList.contains('detail-process-table-shell')).toBe(true);
    expect(table.classList.contains('detail-process-table')).toBe(true);
    expect(headers.map((header) => header.textContent)).toEqual(['PID', '사용자', '명령어', 'VRAM']);
    expect(headers.every((header) => header.getAttribute('scope') === 'col')).toBe(true);
    const cells = within(within(table).getAllByRole('row')[1]).getAllByRole('cell');
    expect(cells.map((cell) => cell.textContent)).toEqual(['4321', 'trainer', 'python train.py', '1,024 MiB']);
    expect(within(region).queryByRole('button')).toBeNull();
  });

  it('preserves the entire original command beyond 1000 characters in wrapped text and title', () => {
    const command = `python train.py\n  --description="${'long command '.repeat(100)}" --token=original-value`;
    render(<DetailProcessList processes={[{ ...process, command }]} />);

    const table = screen.getByRole('table', { name: 'GPU 프로세스' });
    const commandCell = within(within(table).getAllByRole('row')[1]).getAllByRole('cell')[2];

    expect(command.length).toBeGreaterThan(1000);
    expect(commandCell.textContent).toBe(command);
    expect(commandCell.getAttribute('title')).toBe(command);
    expect(commandCell.classList.contains('whitespace-pre-wrap')).toBe(true);
    expect(commandCell.classList.contains('break-words')).toBe(true);
  });

  it('keeps null metadata unknown and actual zero values intact', () => {
    render(<DetailProcessList processes={[
      { ...process, pid: 1, username: null, command: null, gpuMemoryUsedMiB: null },
      { ...process, pid: 0, command: '0', gpuMemoryUsedMiB: 0 }
    ]} />);

    const table = screen.getByRole('table', { name: 'GPU 프로세스' });
    const rows = within(table).getAllByRole('row').slice(1);

    expect(within(rows[0]).getAllByRole('cell').map((cell) => cell.textContent))
      .toEqual(['1', 'unknown', 'unknown', 'unknown']);
    expect(within(rows[1]).getAllByRole('cell').map((cell) => cell.textContent))
      .toEqual(['0', 'trainer', '0', '0 MiB']);
  });

  it('shows no GPU processes for a known-success empty collection', () => {
    render(<DetailProcessList processes={[]} />);

    expect(screen.getByText('실행 중인 GPU 프로세스가 없습니다.')).toBeTruthy();
    expect(screen.queryByText('GPU 프로세스 정보를 수집할 수 없습니다.')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('distinguishes an unavailable empty collection from no processes', () => {
    render(<DetailProcessList processes={[]} unavailable />);

    expect(screen.getByText('GPU 프로세스 정보를 수집할 수 없습니다.')).toBeTruthy();
    expect(screen.queryByText('실행 중인 GPU 프로세스가 없습니다.')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('warns about partial collection without dropping any supplied process rows', () => {
    render(<DetailProcessList processes={[process, { ...process, pid: 5432, command: 'python evaluate.py' }]} unavailable />);

    expect(screen.getByRole('status').textContent)
      .toBe('GPU 프로세스 정보가 일부만 수집되었습니다. 수집된 프로세스를 표시합니다.');
    const table = screen.getByRole('table', { name: 'GPU 프로세스' });
    const rows = within(table).getAllByRole('row').slice(1);

    expect(rows.map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent)))
      .toEqual([
        ['4321', 'trainer', 'python train.py', '1,024 MiB'],
        ['5432', 'trainer', 'python evaluate.py', '1,024 MiB']
      ]);
    expect(screen.queryByText('GPU 프로세스 정보를 수집할 수 없습니다.')).toBeNull();
  });

  it('does not show a partial-collection warning for a successful populated collection', () => {
    render(<DetailProcessList processes={[process]} unavailable={false} />);

    expect(screen.queryByRole('status')).toBeNull();
    expect(within(screen.getByRole('table', { name: 'GPU 프로세스' })).getAllByRole('row')).toHaveLength(2);
  });
});
