import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Shell } from './components/Shell';
import { ErrorState } from './components/ui';
import { ServerDetailScreen } from './features/detail/ServerDetailScreen';
import { HistoryMonitorScreen } from './features/history/HistoryMonitorScreen';
import { OverviewScreen } from './features/overview/OverviewScreen';
import { ProcessTableScreen } from './features/processes/ProcessTableScreen';
import { SettingsScreen } from './features/settings/SettingsScreen';
import { initializeApp, listOverview, queryKeys } from './lib/api';
import { useUiStore } from './lib/store';

const App = () => {
  const activeTab = useUiStore((state) => state.activeTab);
  const selectedServerId = useUiStore((state) => state.selectedServerId);
  const selectServer = useUiStore((state) => state.selectServer);

  const initializeQuery = useQuery({ queryKey: queryKeys.initialize, queryFn: initializeApp });
  const overviewQuery = useQuery({ queryKey: queryKeys.overview, queryFn: listOverview });
  const overview = overviewQuery.data ?? initializeQuery.data ?? null;

  useEffect(() => {
    if (!selectedServerId && overview && overview.length > 0) {
      selectServer(overview[0].id);
    }
  }, [overview, selectServer, selectedServerId]);

  const screen = (() => {
    switch (activeTab) {
      case 'detail':
        return <ServerDetailScreen selectedServerId={selectedServerId} />;
      case 'history':
        return <HistoryMonitorScreen overview={overview ?? []} selectedServerId={selectedServerId} />;
      case 'processes':
        return <ProcessTableScreen />;
      case 'settings':
        return <SettingsScreen />;
      case 'overview':
      default:
        return <OverviewScreen error={overviewQuery.error} isLoading={overviewQuery.isLoading} overview={overview ?? []} />;
    }
  })();

  return (
    <Shell overview={overview}>
      {initializeQuery.error ? <ErrorState message={initializeQuery.error.message} /> : null}
      {screen}
    </Shell>
  );
};

export default App;
