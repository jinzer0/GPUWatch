import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import App from './App';
import { useAppearanceStore } from './lib/appearance';
import './index.css';

const initialScheme = window.gpuwatcherUi && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
document.documentElement.dataset.appearance = initialScheme;

const ThemedApp = () => {
  const mode = useAppearanceStore(state => state.hasLoaded ? state.appearance.resolved : initialScheme);
  return <Theme mode={mode} theme={neutralTheme}><App /></Theme>;
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 8_000
    }
  }
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemedApp />
    </QueryClientProvider>
  </React.StrictMode>
);
