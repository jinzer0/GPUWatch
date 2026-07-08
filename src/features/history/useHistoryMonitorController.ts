import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import type { LabeledSelectOption } from '../../components/ui';
import { listGpuHistory, queryKeys } from '../../lib/api';
import type { GpuHistoryRange, ServerOverviewDto } from '../../lib/types';
import {
  ALL_HISTORY_GPU_VALUE,
  DEFAULT_HISTORY_METRICS,
  gpuLabel,
  gpuOptionValue,
  rangeLabel,
  type HistoryMetricId,
  type HistoryRefreshFeedback
} from './historyModel';

export const useHistoryMonitorController = ({ overview, selectedServerId }: { readonly overview: readonly ServerOverviewDto[]; readonly selectedServerId: string | null }) => {
  const selectedServerExists = useMemo(() => Boolean(selectedServerId && overview.some((server) => server.id === selectedServerId)), [overview, selectedServerId]);
  const preferredServerId = useMemo(() => {
    if (selectedServerId && selectedServerExists) {
      return selectedServerId;
    }
    return overview[0]?.id ?? null;
  }, [overview, selectedServerExists, selectedServerId]);
  const [activeServerId, setActiveServerId] = useState<string | null>(preferredServerId);
  const [range, setRange] = useState<GpuHistoryRange>('1h');
  const [selectedGpu, setSelectedGpu] = useState(ALL_HISTORY_GPU_VALUE);
  const [selectedMetrics, setSelectedMetrics] = useState<HistoryMetricId[]>([...DEFAULT_HISTORY_METRICS]);
  const [refreshFeedback, setRefreshFeedback] = useState<HistoryRefreshFeedback>({ state: 'idle' });

  useEffect(() => {
    if (overview.length === 0) {
      setActiveServerId(null);
      return;
    }

    setActiveServerId((currentServerId) => {
      if (selectedServerId && selectedServerExists) {
        return selectedServerId;
      }
      return currentServerId && overview.some((server) => server.id === currentServerId) ? currentServerId : preferredServerId;
    });
  }, [overview, preferredServerId, selectedServerExists, selectedServerId]);

  const historyQuery = useQuery({
    enabled: Boolean(activeServerId),
    queryFn: () => {
      if (!activeServerId) {
        throw new Error('Select a server before loading GPU history.');
      }
      return listGpuHistory(activeServerId, null, null, range);
    },
    queryKey: queryKeys.gpuHistory(activeServerId, null, null, range)
  });

  const history = historyQuery.data ?? null;
  const gpuOptions = useMemo<LabeledSelectOption[]>(() => {
    const seriesOptions = history?.series.map((series) => ({ label: gpuLabel(series), value: gpuOptionValue(series) })) ?? [];
    return [{ label: 'All GPUs', value: ALL_HISTORY_GPU_VALUE }, ...seriesOptions];
  }, [history]);

  useEffect(() => {
    if (!history) {
      return;
    }
    if (selectedGpu !== ALL_HISTORY_GPU_VALUE && !gpuOptions.some((option) => option.value === selectedGpu)) {
      setSelectedGpu(ALL_HISTORY_GPU_VALUE);
    }
  }, [gpuOptions, history, selectedGpu]);

  const visibleSeries = useMemo(() => {
    const series = history?.series ?? [];
    if (selectedGpu === ALL_HISTORY_GPU_VALUE) {
      return series;
    }
    return series.filter((entry) => gpuOptionValue(entry) === selectedGpu);
  }, [history, selectedGpu]);
  const serverOptions = useMemo<LabeledSelectOption[]>(() => overview.map((server) => ({ label: server.name, value: server.id })), [overview]);
  const activeServer = overview.find((server) => server.id === activeServerId) ?? null;
  const hasConcreteServer = Boolean(activeServerId);
  const hasHistorySeries = visibleSeries.length > 0;
  const hasAnySamples = visibleSeries.some((series) => series.samples.length > 0);

  useEffect(() => {
    setRefreshFeedback({ state: 'idle' });
  }, [activeServerId, range]);

  const toggleMetric = (metricId: HistoryMetricId) => {
    setSelectedMetrics((currentMetrics) => (currentMetrics.includes(metricId) ? currentMetrics.filter((currentMetric) => currentMetric !== metricId) : [...currentMetrics, metricId]));
  };

  const refreshHistory = async () => {
    if (!activeServerId) {
      return;
    }

    setRefreshFeedback({ state: 'pending' });
    const result = await historyQuery.refetch();

    if (result.isError) {
      setRefreshFeedback({ message: result.error?.message ?? 'History refresh failed.', state: 'error' });
      return;
    }

    setRefreshFeedback({ message: `History refreshed for ${activeServer?.name ?? activeServerId} (${rangeLabel(range)}).`, state: 'success' });
  };

  return {
    activeServer,
    activeServerId,
    gpuOptions,
    hasAnySamples,
    hasConcreteServer,
    hasHistorySeries,
    history,
    historyQuery,
    range,
    refreshFeedback,
    refreshHistory,
    selectedGpu,
    selectedMetrics,
    serverOptions,
    setActiveServerId,
    setRange,
    setSelectedGpu,
    toggleMetric,
    visibleSeries
  };
};
