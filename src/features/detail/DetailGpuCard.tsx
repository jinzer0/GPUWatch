import { useId } from 'react';

import { Button, MetricCard } from '../../components/ui';
import { formatKiBPerSecond, formatMiB, formatPercent, formatTime, formatUnknown, formatWatts } from '../../lib/format';
import { useUiStore } from '../../lib/store';
import type { GpuAvailableWatchInput, GpuCardDto, ServerDetailDto, WatchRule } from '../../lib/types';
import { DetailProcessList } from './DetailProcessList';
import { GpuMetricMeter } from './GpuMetricMeter';
import {
  formatClockMhz,
  formatMigInstanceCount,
  formatPcieGeneration,
  formatPcieWidth,
  migAvailabilityCopy,
  migModeLabel,
  shouldShowLastSuccessNote
} from './detailModel';

const GpuMetricSection = ({ children, title }: { readonly children: React.ReactNode; readonly title: string }) => (
  <section className="mt-4">
    <h5 className="text-sm font-semibold">{title}</h5>
    <div className="mt-3 grid grid-cols-4 gap-3">{children}</div>
  </section>
);

export const DetailGpuCard = ({
  detail,
  gpu,
  watchRulesReady,
  watchPending,
  watchRule,
  saveWatch
}: {
  readonly detail: ServerDetailDto;
  readonly gpu: GpuCardDto;
  readonly watchRulesReady: boolean;
  readonly watchPending: boolean;
  readonly watchRule: WatchRule | null;
  readonly saveWatch: (input: GpuAvailableWatchInput) => void;
}) => {
  const watchDescriptionId = useId();
  const gpuKey = gpu.uuid.trim() ? `uuid:${gpu.uuid}` : `index:${gpu.index}`;
  const disclosure = useUiStore((state) => state.gpuDisclosures[detail.server.id]?.[gpuKey]);
  const expanded = disclosure?.expanded ?? false;
  const metricsExpanded = disclosure?.metricsExpanded ?? false;
  const syncDisclosure = (field: 'expanded' | 'metricsExpanded', open: boolean) => {
    const state = useUiStore.getState();
    if ((state.gpuDisclosures[detail.server.id]?.[gpuKey]?.[field] ?? false) !== open) {
      state.setGpuDisclosure(detail.server.id, gpuKey, { [field]: open });
    }
  };
  const toggleDisclosure = (field: 'expanded' | 'metricsExpanded') => {
    const state = useUiStore.getState();
    state.setGpuDisclosure(detail.server.id, gpuKey, {
      [field]: !(state.gpuDisclosures[detail.server.id]?.[gpuKey]?.[field] ?? false)
    });
  };
  const memoryOccupancy = gpu.memoryTotalMiB !== null && gpu.memoryUsedMiB !== null
    && Number.isFinite(gpu.memoryTotalMiB) && Number.isFinite(gpu.memoryUsedMiB)
    && gpu.memoryTotalMiB > 0 && gpu.memoryUsedMiB >= 0 && gpu.memoryUsedMiB <= gpu.memoryTotalMiB
    ? (gpu.memoryUsedMiB / gpu.memoryTotalMiB) * 100
    : null;
  const processesUnavailable = detail.warnings.some((warning) => /compute[-_]apps/i.test(warning));
  const healthy = detail.server.enabled && (detail.health.status === 'online' || detail.health.status === 'polling');
  const available = healthy && gpu.availability.state === 'available';
  const availabilityText = available ? '사용 가능' : !healthy
    ? '가용 상태 unknown'
    : { in_use: '사용 중', candidate: '사용 가능 조건 확인 중', available: '사용 가능', unknown: '가용 상태 unknown' }[gpu.availability.state];
  const defaultCondition = !watchRule || (watchRule.utilizationThresholdPercent === 5
    && watchRule.memoryThresholdMiB === 1024 && watchRule.sustainSeconds === 300);
  const watchCondition = watchRule
    ? `GPU 사용률 ≤ ${watchRule.utilizationThresholdPercent}%, VRAM ≤ ${watchRule.memoryThresholdMiB} MiB가 ${watchRule.sustainSeconds}초 지속되면 알림`
    : 'GPU 사용률 ≤ 5%, VRAM ≤ 1024 MiB가 300초 지속되면 알림';
  const watchTitle = `${defaultCondition ? '기본 사용 가능 조건' : '사용자 지정 조건'}: ${watchCondition}`;
  const savedCooldown = watchRule?.cooldownSeconds ?? 900;
  const toggleWatch = () => {
    if (watchRule) {
      saveWatch({
        id: watchRule.id,
        serverId: watchRule.serverId,
        gpuUuid: watchRule.gpuUuid,
        gpuIndex: watchRule.gpuIndex,
        enabled: !watchRule.enabled,
        utilizationThresholdPercent: watchRule.utilizationThresholdPercent,
        memoryThresholdMiB: watchRule.memoryThresholdMiB,
        sustainSeconds: watchRule.sustainSeconds,
        cooldownSeconds: watchRule.cooldownSeconds
      });
      return;
    }

    saveWatch({
      id: null,
      serverId: detail.server.id,
      gpuUuid: gpu.uuid.trim() ? gpu.uuid : null,
      gpuIndex: gpu.index,
      enabled: true,
      utilizationThresholdPercent: null,
      memoryThresholdMiB: null,
      sustainSeconds: null,
      cooldownSeconds: null
    });
  };

  return (
    <article className={`gpu-card panel${available ? ' gpu-card-available' : ''}`}>
    <details open={expanded} onToggle={(event) => {
      if (event.target === event.currentTarget) syncDisclosure('expanded', event.currentTarget.open);
    }}>
      <summary
        className="gpu-card-summary"
        onClick={(event) => {
          event.preventDefault();
          toggleDisclosure('expanded');
        }}
      >
        <div className="gpu-card-identity">
          <span className="eyebrow">GPU {gpu.index}</span>
          <h4 aria-label={`GPU ${gpu.index} ${gpu.name}`} className="break-words font-semibold">{gpu.name}</h4>
          <span className="text-xs">{availabilityText}</span>
        </div>
        <div className="gpu-card-metrics">
          <GpuMetricMeter label="GPU 사용률" value={gpu.gpuUtilizationPercent} kind="percent" />
          <GpuMetricMeter label="VRAM 점유율" value={memoryOccupancy} kind="percent" />
          <GpuMetricMeter label="온도" value={gpu.temperatureCelsius} kind="temperature" />
          <span className="text-xs text-[color:var(--color-muted)]">
            VRAM {formatMiB(gpu.memoryUsedMiB)} / {formatMiB(gpu.memoryTotalMiB)} · 점유율 {formatPercent(memoryOccupancy)}
          </span>
        </div>
      </summary>
      <div className="gpu-card-body">
        {shouldShowLastSuccessNote(detail) ? (
          <p className="mb-3 text-sm text-[color:var(--color-muted)]">
            마지막 성공 스냅샷입니다. 현재 상태가 아닙니다. 마지막 성공: {formatTime(detail.health.lastSuccessAt)}.
          </p>
        ) : null}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {!watchRulesReady ? (
            <>
              {watchRule ? <span className="text-xs">마지막 저장 상태: 알림 {watchRule.enabled ? '활성화' : '비활성화'}</span> : null}
              <Button aria-describedby={watchDescriptionId} aria-label="Watch status unavailable" disabled size="sm" variant="secondary">
                알림 상태 확인 불가
              </Button>
            </>
          ) : watchRule?.enabled ? (
            <div className="flex flex-wrap items-center gap-2" title={watchTitle}>
              <span className="text-xs font-semibold">알림 활성화</span>
              <Button aria-describedby={watchDescriptionId} aria-label={`Disable ${defaultCondition ? 'availability' : 'custom-condition'} watch for GPU ${gpu.index}`} disabled={watchPending} onClick={toggleWatch} size="sm" variant="ghost">
                알림 해제
              </Button>
            </div>
          ) : (
            <Button aria-describedby={watchDescriptionId} aria-label={defaultCondition ? 'Notify when available' : `Enable custom-condition watch for GPU ${gpu.index}`} disabled={watchPending} onClick={toggleWatch} size="sm" title={watchTitle} variant="secondary">
              {defaultCondition ? '사용 가능 시 알림' : '사용자 지정 조건 알림'}
            </Button>
          )}
          {watchPending ? <span className="text-xs" role="status">GPU {gpu.index} 알림 저장 중</span> : null}
        </div>
        <div className="mb-4 text-xs text-[color:var(--color-muted)]">
          <p id={watchDescriptionId}>{watchTitle}</p>
          {!defaultCondition ? <p>사용자 지정 알림 조건은 기본 사용 가능 표시와 별도로 평가됩니다.</p> : null}
          <p>{watchRule ? `저장된 재알림 간격: ${savedCooldown}초` : '새 알림 기본 재알림 간격: 900초'} · 실제 적용: {Math.max(savedCooldown, 900)}초 (최소 900초 / 15분)</p>
          <p>OS 알림 권한: unknown. macOS 시스템 설정의 알림에서 GPUWatcher 허용 여부와 집중 모드(Focus)를 확인하세요. 알림 전달은 보장되지 않습니다.</p>
        </div>
        <DetailProcessList processes={gpu.processes} unavailable={processesUnavailable} />
        <details className="gpu-extra-metrics mt-4" open={metricsExpanded} onToggle={(event) => {
          if (event.target === event.currentTarget) syncDisclosure('metricsExpanded', event.currentTarget.open);
        }}>
          <summary
            className="text-sm font-semibold"
            onClick={(event) => {
              event.preventDefault();
              toggleDisclosure('metricsExpanded');
            }}
          >
            추가 지표
          </summary>
          <GpuMetricSection title="메모리 및 전력">
            <MetricCard label="Memory activity" value={formatPercent(gpu.memoryUtilizationPercent)} />
            <MetricCard label="Memory free" value={formatMiB(gpu.memoryFreeMiB)} />
            <MetricCard label="Power / limit" value={`${formatWatts(gpu.powerDrawWatt)} / ${formatWatts(gpu.powerLimitWatt)}`} />
            <MetricCard label="Fan" value={formatPercent(gpu.fanSpeedPercent)} />
            <MetricCard label="스냅샷 프로세스 수" value={processesUnavailable && gpu.processCount === 0 ? 'unknown' : gpu.processCount} />
          </GpuMetricSection>
          <GpuMetricSection title="기능 및 식별 정보">
            <MetricCard label="UUID" value={formatUnknown(gpu.uuid)} />
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
          <GpuMetricSection title="MIG">
            <MetricCard label="Current mode" value={migModeLabel(gpu.migModeCurrent)} />
            <MetricCard label="Pending mode" value={migModeLabel(gpu.migModePending)} />
            <MetricCard label="Instance count" value={formatMigInstanceCount(gpu.migInstanceCount)} />
          </GpuMetricSection>
          <p className="mt-3 text-sm text-[color:var(--color-muted)]">{migAvailabilityCopy(gpu)}</p>
        </details>
      </div>
    </details>
    </article>
  );
};
