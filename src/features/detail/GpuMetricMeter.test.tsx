import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GpuMetricMeter } from './GpuMetricMeter';

const segmentWidths = (meter: HTMLElement) => Array.from(meter.querySelectorAll<HTMLElement>('.gpu-meter-segment-fill'), (segment) => Number.parseFloat(segment.style.width));

const percentCases = [
  { value: 0, tone: 'green' },
  { value: 30, tone: 'green' },
  { value: 30.1, tone: 'yellow' },
  { value: 60, tone: 'yellow' },
  { value: 60.1, tone: 'red' },
  { value: 100, tone: 'red' }
] as const;

const temperatureCases = [
  { value: -5, tone: 'green' },
  { value: 0, tone: 'green' },
  { value: 60, tone: 'green' },
  { value: 60.1, tone: 'yellow' },
  { value: 80, tone: 'yellow' },
  { value: 80.1, tone: 'red' },
  { value: 105, tone: 'red' }
] as const;

const invalidValues = [null, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0.1] as const;

describe('GpuMetricMeter', () => {
  it.each(percentCases)('displays actual percent $value with $tone tone and proportional fill', ({ value, tone }) => {
    render(<GpuMetricMeter kind="percent" label="GPU utilization" value={value} />);

    const meter = screen.getByRole('meter', { name: 'GPU utilization' });
    const segments = meter.querySelectorAll('.gpu-meter-segment');
    const widths = segmentWidths(meter);

    expect(meter.getAttribute('data-tone')).toBe(tone);
    expect(meter.querySelector('.gpu-meter')?.getAttribute('data-tone')).toBe(tone);
    expect(meter.querySelector('.gpu-metric-value')?.textContent).toBe(`${value}%`);
    expect(meter.getAttribute('aria-valuenow')).toBe(String(value));
    expect(meter.getAttribute('aria-valuetext')).toBe(`${value}% · ${tone === 'green' ? '낮음' : tone === 'yellow' ? '중간' : '높음'}`);
    expect(meter.getAttribute('aria-valuemax')).toBe('100');
    expect(segments).toHaveLength(20);
    expect(Array.from(segments).every((segment) => segment.getAttribute('data-tone') === tone)).toBe(true);
    expect(widths).toHaveLength(20);
    expect(widths.every((width) => width >= 0 && width <= 100)).toBe(true);
    expect(widths.reduce((sum, width) => sum + width, 0) / 20).toBeCloseTo(value);
    expect(widths.filter((width) => width > 0)).toHaveLength(Math.ceil(value / 5));
  });

  it.each(temperatureCases)('displays actual temperature $value with $tone tone and clamped fill', ({ value, tone }) => {
    render(<GpuMetricMeter kind="temperature" label="Temperature" value={value} />);

    const meter = screen.getByRole('meter', { name: 'Temperature' });
    const widths = segmentWidths(meter);

    expect(meter.getAttribute('data-tone')).toBe(tone);
    expect(meter.querySelector('.gpu-metric-value')?.textContent).toBe(`${value}°C`);
    expect(meter.getAttribute('aria-valuenow')).toBe(String(value));
    expect(meter.getAttribute('aria-valuetext')).toBe(`${value}°C · ${tone === 'green' ? '낮음' : tone === 'yellow' ? '중간' : '높음'}`);
    expect(meter.getAttribute('aria-valuemax')).toBe(String(Math.max(100, value)));
    expect(meter.querySelectorAll('.gpu-meter-segment')).toHaveLength(20);
    expect(widths).toHaveLength(20);
    expect(widths.reduce((sum, width) => sum + width, 0) / 20).toBeCloseTo(Math.max(0, Math.min(value, 100)));
    expect(widths.every((width) => width >= 0 && width <= 100)).toBe(true);
    if (value > 100) {
      expect(widths.every((width) => width === 100)).toBe(true);
    }
  });

  it.each([...invalidValues, 100.1])('renders invalid percent %s as unknown without numbers or fill', (value) => {
    render(<GpuMetricMeter kind="percent" label="GPU utilization" value={value} />);

    const meter = screen.getByRole('meter', { name: 'GPU utilization' });
    const track = meter.querySelector<HTMLElement>('.gpu-meter');

    expect(meter.getAttribute('data-tone')).toBe('unknown');
    expect(meter.querySelector('.gpu-metric-value')?.textContent).toBe('unknown');
    expect(meter.hasAttribute('aria-valuenow')).toBe(false);
    expect(meter.getAttribute('aria-valuetext')).toBe('unknown · 알 수 없음');
    expect(track?.getAttribute('data-tone')).toBe('unknown');
    expect(track?.style.borderStyle).toBe('dashed');
    expect(meter.querySelectorAll('.gpu-meter-segment')).toHaveLength(20);
    expect(meter.querySelectorAll('.gpu-meter-segment-fill')).toHaveLength(0);
  });

  it.each(invalidValues.filter((value) => value === null || !Number.isFinite(value)))('renders invalid temperature %s as unknown without numbers or fill', (value) => {
    render(<GpuMetricMeter kind="temperature" label="Temperature" value={value} />);

    const meter = screen.getByRole('meter', { name: 'Temperature' });

    expect(meter.getAttribute('data-tone')).toBe('unknown');
    expect(meter.querySelector('.gpu-metric-value')?.textContent).toBe('unknown');
    expect(meter.hasAttribute('aria-valuenow')).toBe(false);
    expect(meter.getAttribute('aria-valuetext')).toBe('unknown · 알 수 없음');
    expect(meter.querySelector<HTMLElement>('.gpu-meter')?.style.borderStyle).toBe('dashed');
    expect(meter.querySelectorAll('.gpu-meter-segment-fill')).toHaveLength(0);
  });

  it.each(['percent', 'temperature'] as const)('preserves the fractional final segment for %s', (kind) => {
    render(<GpuMetricMeter kind={kind} label="Metric" value={30.1} />);

    const meter = screen.getByRole('meter', { name: 'Metric' });
    const widths = segmentWidths(meter);

    expect(widths.slice(0, 6)).toEqual(Array.from({ length: 6 }, () => 100));
    expect(widths[6]).toBeCloseTo(2);
    expect(widths.slice(7)).toEqual(Array.from({ length: 13 }, () => 0));
    expect(meter.querySelector<HTMLElement>('.gpu-meter')?.style.gridTemplateColumns).toBe('repeat(20, minmax(0, 1fr))');
  });

  it('exposes one accessible reading without duplicating the visible numeric text', () => {
    render(<GpuMetricMeter kind="percent" label="GPU utilization" value={30.1} />);

    const meter = screen.getByRole('meter', { name: 'GPU utilization' });

    expect(screen.getAllByRole('meter')).toHaveLength(1);
    expect(meter.getAttribute('aria-valuemin')).toBe('0');
    expect(meter.getAttribute('aria-valuetext')).toBe('30.1% · 중간');
    expect(meter.querySelector('.gpu-metric-heading')?.getAttribute('aria-hidden')).toBe('true');
    expect(meter.querySelector('.gpu-metric-value')?.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(meter.querySelector('.gpu-meter')?.getAttribute('aria-hidden')).toBe('true');
  });
});
