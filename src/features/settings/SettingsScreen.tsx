import { useUiStore } from '../../lib/store';
import { ServerManagerSheet } from './ServerManagerSheet';

export const SettingsScreen = () => {
  const managementOpen = useUiStore((state) => state.managementOpen);
  return managementOpen ? <ServerManagerSheet /> : null;
};
