import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GpuMetricMeter } from './GpuMetricMeter';

const fillWidth = (meter: HTMLElement) => Number.parseFloat(meter.querySelector<HTMLElement>('.gpu-meter-fill')?.style.width ?? 'NaN');

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
    const width = fillWidth(meter);

    expect(meter.getAttribute('data-tone')).toBe(tone);
    expect(meter.querySelector('.gpu-meter')?.getAttribute('data-tone')).toBe(tone);
    expect(meter.querySelector('.gpu-metric-value')?.textContent).toBe(`${value}%`);
    expect(meter.getAttribute('aria-valuenow')).toBe(String(value));
    expect(meter.getAttribute('aria-valuetext')).toBe(`${value}% · ${tone === 'green' ? '낮음' : tone === 'yellow' ? '중간' : '높음'}`);
    expect(meter.getAttribute('aria-valuemax')).toBe('100');
    expect(meter.querySelectorAll('.gpu-meter-fill')).toHaveLength(1);
    expect(width).toBeCloseTo(value);
  });

  it.each(temperatureCases)('displays actual temperature $value with $tone tone and clamped fill', ({ value, tone }) => {
    render(<GpuMetricMeter kind="temperature" label="Temperature" value={value} />);

    const meter = screen.getByRole('meter', { name: 'Temperature' });
    const width = fillWidth(meter);

    expect(meter.getAttribute('data-tone')).toBe(tone);
    expect(meter.querySelector('.gpu-metric-value')?.textContent).toBe(`${value}°C`);
    expect(meter.getAttribute('aria-valuenow')).toBe(String(value));
    expect(meter.getAttribute('aria-valuetext')).toBe(`${value}°C · ${tone === 'green' ? '낮음' : tone === 'yellow' ? '중간' : '높음'}`);
    expect(meter.getAttribute('aria-valuemax')).toBe(String(Math.max(100, value)));
    expect(meter.getAttribute('aria-valuemin')).toBe(String(Math.min(0, value)));
    expect(meter.querySelectorAll('.gpu-meter-fill')).toHaveLength(1);
    expect(width).toBeCloseTo(Math.max(0, Math.min(value, 100)));
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
    expect(meter.querySelectorAll('.gpu-meter-fill')).toHaveLength(0);
  });

  it.each(invalidValues.filter((value) => value === null || !Number.isFinite(value)))('renders invalid temperature %s as unknown without numbers or fill', (value) => {
    render(<GpuMetricMeter kind="temperature" label="Temperature" value={value} />);

    const meter = screen.getByRole('meter', { name: 'Temperature' });

    expect(meter.getAttribute('data-tone')).toBe('unknown');
    expect(meter.querySelector('.gpu-metric-value')?.textContent).toBe('unknown');
    expect(meter.hasAttribute('aria-valuenow')).toBe(false);
    expect(meter.getAttribute('aria-valuetext')).toBe('unknown · 알 수 없음');
    expect(meter.querySelector<HTMLElement>('.gpu-meter')?.style.borderStyle).toBe('dashed');
    expect(meter.querySelectorAll('.gpu-meter-fill')).toHaveLength(0);
  });

  it.each(['percent', 'temperature'] as const)('preserves fractional continuous fill for %s', (kind) => {
    render(<GpuMetricMeter kind={kind} label="Metric" value={30.1} />);

    const meter = screen.getByRole('meter', { name: 'Metric' });
    const width = fillWidth(meter);

    expect(width).toBeCloseTo(30.1);
    expect(meter.querySelectorAll('.gpu-meter-fill')).toHaveLength(1);
  });

  it('keeps live updates distinct for zero, unknown and a measured value', () => {
    const { rerender } = render(<GpuMetricMeter kind="percent" label="GPU utilization" value={0} />);
    const meter = screen.getByRole('meter', { name: 'GPU utilization' });

    expect(fillWidth(meter)).toBe(0);
    expect(meter.getAttribute('aria-valuenow')).toBe('0');

    rerender(<GpuMetricMeter kind="percent" label="GPU utilization" value={null} />);
    expect(meter.querySelector('.gpu-meter-fill')).toBeNull();
    expect(meter.hasAttribute('aria-valuenow')).toBe(false);
    expect(meter.getAttribute('aria-valuetext')).toBe('unknown · 알 수 없음');
    expect(meter.querySelector<HTMLElement>('.gpu-meter')?.style.borderStyle).toBe('dashed');

    rerender(<GpuMetricMeter kind="percent" label="GPU utilization" value={60.1} />);
    expect(fillWidth(meter)).toBeCloseTo(60.1);
    expect(meter.getAttribute('aria-valuetext')).toBe('60.1% · 높음');
    expect(meter.querySelector<HTMLElement>('.gpu-meter')?.style.borderStyle).toBe('');
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
