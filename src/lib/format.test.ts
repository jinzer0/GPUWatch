import { describe, expect, it } from 'vitest';

import { formatMiB, formatPercent, formatTemperature, formatUnknown, formatWatts } from './format';

describe('format helpers', () => {
  it('renders unavailable metrics as unknown instead of zero', () => {
    expect(formatUnknown(null)).toBe('unknown');
    expect(formatMiB(null)).toBe('unknown');
    expect(formatPercent(undefined)).toBe('unknown');
    expect(formatTemperature(null)).toBe('unknown');
    expect(formatWatts(undefined)).toBe('unknown');
  });

  it('renders numeric zero only when zero is provided', () => {
    expect(formatMiB(0)).toBe('0 MiB');
    expect(formatPercent(0)).toBe('0.0%');
  });
});
