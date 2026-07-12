import { MetricCard, StatusBadge } from '../../components/ui';
import { formatKiBPerSecond, formatMiB, formatPercent, formatTemperature, formatUnknown, formatWatts } from '../../lib/format';
import { getLiveGpuSampleKey } from '../../lib/liveHistory';
import type { LiveGpuSample } from '../../lib/liveHistory';
import type { GpuCardDto, GpuHistoryResponseDto, ServerDetailDto } from '../../lib/types';
import { DetailGpuHistorySection } from './DetailGpuHistorySection';
import { DetailProcessList } from './DetailProcessList';
import {
  formatClockMhz,
  formatMigInstanceCount,
  formatPcieGeneration,
  formatPcieWidth,
  migAvailabilityCopy,
  migBadgeLabel,
  migModeLabel,
  resolveGpuHistoryChartData
} from './detailModel';

const GpuMetricSection = ({ children, eyebrow, title }: { readonly children: React.ReactNode; readonly eyebrow?: string; readonly title: string }) => (
  <section className="mt-5">
    <h5 className="font-[var(--font-display)] text-xl font-bold tracking-[-0.05em]">{title}</h5>
    {eyebrow ? <div className="eyebrow mt-2">{eyebrow}</div> : null}
    <div className="mt-3 grid grid-cols-4 gap-3">{children}</div>
  </section>
);

const MigSummarySection = ({ gpu }: { readonly gpu: GpuCardDto }) => (
  <section className="mt-5">
    <div className="eyebrow">MIG</div>
    <div className="surface mt-3 p-4">
      <p className="text-sm font-semibold text-[color:var(--color-text)]">Mode current: {migModeLabel(gpu.migModeCurrent)}</p>
      <p className="mt-2 text-sm font-semibold text-[color:var(--color-text)]">Mode pending: {migModeLabel(gpu.migModePending)}</p>
      <p className="mt-2 text-sm font-semibold text-[color:var(--color-text)]">Instance count: {formatMigInstanceCount(gpu.migInstanceCount)}</p>
      <p className="mt-3 text-sm leading-6 text-[color:var(--color-muted)]">{migAvailabilityCopy(gpu)}</p>
    </div>
    <div className="mt-3 grid grid-cols-4 gap-3">
      <MetricCard label="Current mode" value={migModeLabel(gpu.migModeCurrent)} />
      <MetricCard label="Pending mode" value={migModeLabel(gpu.migModePending)} />
      <MetricCard label="Instance count" value={formatUnknown(gpu.migInstanceCount)} />
    </div>
  </section>
);

export const DetailGpuCard = ({
  detail,
  gpu,
  liveSamples,
  storedHistory,
  storedHistoryReady
}: {
  readonly detail: ServerDetailDto;
  readonly gpu: GpuCardDto;
  readonly liveSamples: Readonly<Record<string, readonly LiveGpuSample[]>>;
  readonly storedHistory: GpuHistoryResponseDto | null;
  readonly storedHistoryReady: boolean;
}) => {
  const chartData = resolveGpuHistoryChartData({
    gpu,
    history: storedHistory,
    isStoredHistoryReady: storedHistoryReady,
    sessionSamples: liveSamples[getLiveGpuSampleKey(detail.server.id, gpu.index)] ?? []
  });

  return (
    <article className="detail-gpu-panel panel p-5" key={gpu.uuid}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="eyebrow">GPU {gpu.index}</div>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h4 aria-label={`GPU ${gpu.index} ${gpu.name}`} className="break-words font-[var(--font-display)] text-2xl font-bold tracking-[-0.06em]">{gpu.name}</h4>
            <StatusBadge status={migBadgeLabel(gpu)} />
          </div>
          <p className="mt-1 break-words text-xs text-[color:var(--color-muted)]">{gpu.uuid}</p>
        </div>
        <StatusBadge status={gpu.busy ? 'busy' : 'free'} />
      </div>
      <GpuMetricSection eyebrow="Live utilization" title="Primary telemetry">
        <MetricCard label="Utilization" value={formatPercent(gpu.gpuUtilizationPercent)} />
        <MetricCard label="Memory" value={formatPercent(gpu.memoryUtilizationPercent)} />
        <MetricCard label="Temperature" value={formatTemperature(gpu.temperatureCelsius)} />
        <MetricCard label="Memory used" value={`${formatMiB(gpu.memoryUsedMiB)} / ${formatMiB(gpu.memoryTotalMiB)}`} />
        <MetricCard label="Memory free" value={formatMiB(gpu.memoryFreeMiB)} />
        <MetricCard label="Power" value={`${formatWatts(gpu.powerDrawWatt)} / ${formatWatts(gpu.powerLimitWatt)}`} />
        <MetricCard label="Fan" value={formatPercent(gpu.fanSpeedPercent)} />
        <MetricCard label="Processes" value={gpu.processCount} />
      </GpuMetricSection>
      <GpuMetricSection title="Capabilities and identity">
        <MetricCard label="Encoder" value={formatPercent(gpu.encoderUtilizationPercent)} />
        <MetricCard label="Decoder" value={formatPercent(gpu.decoderUtilizationPercent)} />
        <MetricCard label="JPEG" value={formatPercent(gpu.jpegUtilizationPercent)} />
        <MetricCard label="OFA" value={formatPercent(gpu.ofaUtilizationPercent)} />
        <MetricCard label="PCI bus id" value={formatUnknown(gpu.pciBusId)} />
        <MetricCard label="Per-GPU driver" value={formatUnknown(gpu.driverVersion)} />
        <MetricCard label="Graphics clock" value={formatClockMhz(gpu.graphicsClockMhz)} />
        <MetricCard label="Memory clock" value={formatClockMhz(gpu.memoryClockMhz)} />
      </GpuMetricSection>
      <GpuMetricSection title="PCIe">
        <MetricCard label="RX" value={formatKiBPerSecond(gpu.pcieRxKibPerSec)} />
        <MetricCard label="TX" value={formatKiBPerSecond(gpu.pcieTxKibPerSec)} />
        <MetricCard label="Link generation" value={formatPcieGeneration(gpu.pcieLinkGenCurrent)} />
        <MetricCard label="Link width" value={formatPcieWidth(gpu.pcieLinkWidthCurrent)} />
      </GpuMetricSection>
      <MigSummarySection gpu={gpu} />
      <DetailGpuHistorySection detail={detail} gpu={gpu} samples={chartData.samples} source={chartData.source} />
      <div className="mt-5">
        <DetailProcessList processes={gpu.processes} />
      </div>
    </article>
  );
};
