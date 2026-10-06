import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getServerDetail, listWatchRules, queryKeys, refreshServer, saveGpuAvailableWatch } from '../../lib/api';
import type { GpuAvailableWatchInput, ServerDetailDto, WatchRule } from '../../lib/types';

export const getWatchTargetKey = (serverId: string, gpuUuid: string | null, gpuIndex: number) =>
  gpuUuid === null ? `${serverId}:index:${gpuIndex}` : `${serverId}:uuid:${gpuUuid}`;

export const useServerDetailController = (selectedServerId: string | null) => {
  const queryClient = useQueryClient();
  const pendingWatchTargetsRef = useRef(new Set<string>());
  const [pendingWatchTargets, setPendingWatchTargets] = useState<readonly string[]>([]);
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
  const watchRulesQuery = useQuery<WatchRule[]>({
    enabled: selectedServerId !== null,
    queryFn: () => listWatchRules(selectedServerId ?? ''),
    queryKey: selectedServerId ? queryKeys.watchRules(selectedServerId) : ['watch-rules', 'none']
  });
  const watchMutation = useMutation({
    mutationFn: (input: GpuAvailableWatchInput) => saveGpuAvailableWatch(input),
    onSuccess: (_rule, input) => queryClient.invalidateQueries({ queryKey: queryKeys.watchRules(input.serverId) })
  });
  const saveWatch = (input: GpuAvailableWatchInput) => {
    const target = getWatchTargetKey(input.serverId, input.gpuUuid, input.gpuIndex);
    if (pendingWatchTargetsRef.current.has(target)) {
      return;
    }

    pendingWatchTargetsRef.current.add(target);
    setPendingWatchTargets([...pendingWatchTargetsRef.current]);
    watchMutation.mutate(input, {
      onSettled: () => {
        pendingWatchTargetsRef.current.delete(target);
        setPendingWatchTargets([...pendingWatchTargetsRef.current]);
      }
    });
  };
  const refreshMutation = useMutation({
    mutationFn: refreshServer,
    onSuccess: (_result, id) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.detail(id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.overview }),
        queryClient.invalidateQueries({ queryKey: queryKeys.processes })
      ])
  });

  return {
    detail,
    detailQuery,
    refreshMutation,
    pendingWatchTargets,
    saveWatch,
    watchMutation,
    watchRules: watchRulesQuery.data ?? [],
    watchRulesQuery
  };
};
