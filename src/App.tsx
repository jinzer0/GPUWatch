import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Shell } from './components/Shell';
import { ErrorState, LoadingState } from './components/ui';
import { ServerDetailScreen } from './features/detail/ServerDetailScreen';
import { SettingsScreen } from './features/settings/SettingsScreen';
import { AppearanceSettings } from './features/settings/AppearanceSettings';
import { initializeApp, listOverview, queryKeys } from './lib/api';
import { connectAppearance } from './lib/appearance';
import { useUiStore } from './lib/store';

const MainScreen = () => {
  const selectedServerId = useUiStore((state) => state.selectedServerId);
  const managementOpen = useUiStore((state) => state.managementOpen);
  const reconcileServers = useUiStore((state) => state.reconcileServers);
  const initializeQuery = useQuery({ queryKey: queryKeys.initialize, queryFn: initializeApp });
  const overviewQuery = useQuery({
    queryKey: queryKeys.overview,
    queryFn: listOverview,
    enabled: initializeQuery.isSuccess,
    refetchInterval: 5_000
  });
  const overview = overviewQuery.data ?? initializeQuery.data ?? null;
  const validSelectedServerId = overviewQuery.data
    ? overviewQuery.data.find((server) => server.id === selectedServerId)?.id ?? overviewQuery.data[0]?.id ?? null
    : null;

  useEffect(() => {
    if (overviewQuery.isSuccess) {
      reconcileServers(overviewQuery.data.map((server) => server.id));
    }
  }, [overviewQuery.data, overviewQuery.isSuccess, reconcileServers]);

  const error = initializeQuery.error ?? overviewQuery.error;
  return (
    <Shell overview={overview}>
      {error ? <ErrorState message={error.message} /> : null}
      {managementOpen ? <SettingsScreen /> : initializeQuery.isPending || overviewQuery.isLoading ? (
        <LoadingState label="Loading servers..." />
      ) : error && !overviewQuery.data ? null : (
        <ServerDetailScreen selectedServerId={validSelectedServerId} />
      )}
    </Shell>
  );
};

export const getWindowRole = (search: string): 'main' | 'settings' =>
  new URLSearchParams(search).get('window') === 'settings' ? 'settings' : 'main';

const App = () => {
  const role = getWindowRole(window.location.search);
  useEffect(() => {
    document.title = role === 'settings' ? 'GPUWatcher 설정' : 'GPUWatcher';
    return connectAppearance();
  }, [role]);
  if (role === 'settings') {
    return <div className="settings-window"><header className="settings-window-titlebar">GPUWatcher 설정</header><AppearanceSettings /></div>;
  }
  return <MainScreen />;
};

export default App;
