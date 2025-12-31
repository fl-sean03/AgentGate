import { ReactElement } from 'react';
import { render, RenderOptions, renderHook as originalRenderHook, RenderHookOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

// Create a fresh QueryClient for each test
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  queryClient?: QueryClient;
  route?: string;
}

function customRender(
  ui: ReactElement,
  options: CustomRenderOptions = {}
) {
  const { queryClient = createTestQueryClient(), route = '/', ...renderOptions } = options;

  // Set initial route
  window.history.pushState({}, 'Test page', route);

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>{children}</BrowserRouter>
      </QueryClientProvider>
    );
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
    queryClient,
  };
}

interface CustomRenderHookOptions<Props> extends Omit<RenderHookOptions<Props>, 'wrapper'> {
  queryClient?: QueryClient;
  route?: string;
}

function customRenderHook<Result, Props>(
  hook: (props: Props) => Result,
  options: CustomRenderHookOptions<Props> = {}
) {
  const { queryClient = createTestQueryClient(), route = '/', ...renderOptions } = options;

  // Set initial route
  window.history.pushState({}, 'Test page', route);

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>{children}</BrowserRouter>
      </QueryClientProvider>
    );
  }

  return {
    ...originalRenderHook(hook, { wrapper: Wrapper, ...renderOptions }),
    queryClient,
  };
}

// Re-export everything except render and renderHook
// eslint-disable-next-line react-refresh/only-export-components
export * from '@testing-library/react';
export { customRender as render, customRenderHook as renderHook, createTestQueryClient };
