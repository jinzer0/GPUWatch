export const GpuMetricMeter = ({
  label,
  value,
  kind
}: {
  readonly label: string;
  readonly value: number | null;
  readonly kind: 'percent' | 'temperature';
}) => {
  const knownValue = value !== null && Number.isFinite(value) && (kind === 'temperature' || (value >= 0 && value <= 100))
    ? value
    : null;
  const greenLimit = kind === 'percent' ? 30 : 60;
  const yellowLimit = kind === 'percent' ? 60 : 80;
  const tone = knownValue === null ? 'unknown' : knownValue <= greenLimit ? 'green' : knownValue <= yellowLimit ? 'yellow' : 'red';
  const text = knownValue === null ? 'unknown' : `${knownValue}${kind === 'percent' ? '%' : '°C'}`;
  const band = tone === 'green' ? '낮음' : tone === 'yellow' ? '중간' : tone === 'red' ? '높음' : '알 수 없음';
  const fill = knownValue === null ? null : Math.max(0, Math.min(knownValue, 100));

  return (
    <div
      aria-label={label}
      aria-valuemax={knownValue === null ? 100 : Math.max(100, knownValue)}
      aria-valuemin={knownValue === null ? 0 : Math.min(0, knownValue)}
      aria-valuenow={knownValue ?? undefined}
      aria-valuetext={`${text} · ${band}`}
      className="gpu-metric"
      data-tone={tone}
      role="meter"
    >
      <div aria-hidden="true" className="gpu-metric-heading">
        <span className="gpu-metric-label">{label}</span>
        <span className="gpu-metric-value">{text}</span>
        <span className="gpu-metric-band">{band}</span>
      </div>
      <div
        aria-hidden="true"
        className="gpu-meter"
        data-tone={tone}
        style={{ borderStyle: knownValue === null ? 'dashed' : undefined }}
      >
        {fill === null ? null : <span className="gpu-meter-fill" style={{ width: `${fill}%` }} />}
      </div>
    </div>
  );
};
