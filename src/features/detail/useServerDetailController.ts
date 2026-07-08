import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getServerDetail, listGpuHistory, queryKeys, refreshServer } from '../../lib/api';
import { getLiveGpuSampleKey } from '../../lib/liveHistory';
import { useUiStore } from '../../lib/store';
import type { GpuHistoryResponseDto, ServerDetailDto } from '../../lib/types';
import { historyQueryRange, isFailedReplacementSnapshot } from './detailModel';

export const useServerDetailController = (selectedServerId: string | null) => {
  const queryClient = useQueryClient();
  const appendLiveSamplesFromDetail = useUiStore((state) => state.appendLiveSamplesFromDetail);
  const liveSamples = useUiStore((state) => state.liveSamples);
  const lastAppendedDetailKey = useRef<string | null>(null);
  const detailQuery = useQuery<ServerDetailDto | null>({
    queryKey: selectedServerId ? queryKeys.detail(selectedServerId) : ['server-detail', 'none'],
    queryFn: () => getServerDetail(selectedServerId ?? ''),
    enabled: selectedServerId !== null,
    refetchInterval: (query) => {
      if (selectedServerId === null) {
        return false;
      }
      const detail = query.state.data;
      return Math.max((detail?.server.pollingIntervalSeconds ?? 10) * 1000, 5_000);
    }
  });
  const detail = detailQuery.data ?? null;
  const detailServerId = detail?.server.id ?? null;
  const historyQuery = useQuery<GpuHistoryResponseDto>({
    enabled: Boolean(detailServerId),
    queryFn: () => {
      if (!detailServerId) {
        throw new Error('Select a server before loading GPU history.');
      }
      return listGpuHistory(detailServerId, null, null, historyQueryRange);
    },
    queryKey: queryKeys.gpuHistory(detailServerId, null, null, historyQueryRange),
    refetchInterval: () => (detail ? Math.max(detail.server.pollingIntervalSeconds * 1000, 5_000) : false)
  });
  const refreshMutation = useMutation({
    mutationFn: refreshServer,
    onSuccess: (_result, id) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.detail(id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.gpuHistory(id, null, null, historyQueryRange) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.overview }),
        queryClient.invalidateQueries({ queryKey: queryKeys.processes })
      ])
  });

  useEffect(() => {
    const detail = detailQuery.data;
    if (!detail?.receivedAt || isFailedReplacementSnapshot(detail)) {
      return;
    }

    const detailKey = `${detail.server.id}:${detail.receivedAt}`;
    if (lastAppendedDetailKey.current === detailKey) {
      return;
    }

    appendLiveSamplesFromDetail(detail);
    lastAppendedDetailKey.current = detailKey;
  }, [appendLiveSamplesFromDetail, detailQuery.data]);

  return {
    detail,
    detailQuery,
    historyQuery,
    liveSamples,
    refreshMutation,
    storedHistory: historyQuery.isSuccess ? historyQuery.data : null,
    storedHistoryReady: historyQuery.isSuccess
  };
};
