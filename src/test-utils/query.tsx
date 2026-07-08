import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement } from 'react';

export const makeTestQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

export const renderWithQueryClient = (ui: ReactElement, options?: RenderOptions) => {
  const queryClient = makeTestQueryClient();
  const view = render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>, options);

  return { queryClient, ...view };
};
