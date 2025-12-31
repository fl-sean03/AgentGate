# DevGuide v0.2.9: Dashboard Tests

## Thrust 3: Dashboard Vitest Setup

### Overview

Configure Vitest with React Testing Library for the dashboard package. This establishes the testing infrastructure needed for component and hook tests.

### Implementation Tasks

#### Task 3.1: Install Test Dependencies

```bash
cd packages/dashboard
pnpm add -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom msw
```

#### Task 3.2: Create Vitest Configuration

**File**: `packages/dashboard/vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**'],
    },
  },
});
```

#### Task 3.3: Create Test Setup

**File**: `packages/dashboard/src/test/setup.ts`

```typescript
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));
```

#### Task 3.4: Update Package.json Scripts

**File**: `packages/dashboard/package.json` (update scripts)

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "typecheck": "tsc -b --noEmit",
    "preview": "vite preview",
    "format": "prettier --write \"src/**/*.{ts,tsx,json,css}\"",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

#### Task 3.5: Create Test Utilities

**File**: `packages/dashboard/src/test/utils.tsx`

```typescript
import { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
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

export * from '@testing-library/react';
export { customRender as render, createTestQueryClient };
```

### Verification

```bash
cd packages/dashboard
pnpm test
```

Expected: Test infrastructure is configured, no tests yet but vitest runs.

---

## Thrust 4: Dashboard Component Tests

### Overview

Write tests for key dashboard components using React Testing Library.

### Implementation Tasks

#### Task 4.1: API Client Tests

**File**: `packages/dashboard/src/api/__tests__/client.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiRequest, ApiError, get, post, del } from '../client';

describe('API Client', () => {
  const mockFetch = vi.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = mockFetch;
    localStorage.clear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  describe('apiRequest', () => {
    it('should make GET request with correct URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: 'test' }),
      });

      await apiRequest('/test-endpoint', { method: 'GET' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/test-endpoint'),
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should include Authorization header when API key is set', async () => {
      localStorage.setItem('agentgate_api_key', 'test-key');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: 'test' }),
      });

      await apiRequest('/test', { method: 'GET' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key',
          }),
        })
      );
    });

    it('should throw ApiError on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Not found' },
        }),
      });

      await expect(apiRequest('/test', { method: 'GET' })).rejects.toThrow(ApiError);
    });

    it('should parse error response correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'Invalid input' },
        }),
      });

      try {
        await apiRequest('/test', { method: 'GET' });
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).code).toBe('BAD_REQUEST');
        expect((error as ApiError).message).toBe('Invalid input');
      }
    });
  });

  describe('get helper', () => {
    it('should make GET request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: [] }),
      });

      const result = await get<{ items: unknown[] }>('/work-orders');

      expect(result.items).toEqual([]);
    });

    it('should append query params', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: [] }),
      });

      await get('/work-orders', { limit: 10, status: 'running' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=10'),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('status=running'),
        expect.any(Object)
      );
    });
  });

  describe('post helper', () => {
    it('should make POST request with JSON body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'new-id' }),
      });

      await post('/work-orders', { taskPrompt: 'Test' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: expect.any(String),
        })
      );
    });
  });

  describe('del helper', () => {
    it('should make DELETE request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await del('/work-orders/123');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/work-orders/123'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });
});
```

#### Task 4.2: WebSocket Client Tests

**File**: `packages/dashboard/src/api/__tests__/websocket.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketClient } from '../websocket';

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((error: Error) => void) | null = null;
  readyState = 0; // CONNECTING
  sent: string[] = [];

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3; // CLOSED
  }

  // Test helpers
  simulateOpen() {
    this.readyState = 1; // OPEN
    this.onopen?.();
  }

  simulateMessage(data: object) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  simulateClose() {
    this.readyState = 3;
    this.onclose?.();
  }
}

describe('WebSocketClient', () => {
  let client: WebSocketClient;

  beforeEach(() => {
    MockWebSocket.instances = [];
    // @ts-expect-error - Mocking WebSocket
    global.WebSocket = MockWebSocket;
    client = new WebSocketClient('ws://localhost:3000/ws');
  });

  afterEach(() => {
    client.disconnect();
    vi.clearAllMocks();
  });

  describe('connect', () => {
    it('should create WebSocket connection', () => {
      client.connect();

      expect(MockWebSocket.instances).toHaveLength(1);
      expect(MockWebSocket.instances[0].url).toBe('ws://localhost:3000/ws');
    });

    it('should not create duplicate connections', () => {
      client.connect();
      client.connect();

      expect(MockWebSocket.instances).toHaveLength(1);
    });
  });

  describe('subscribe', () => {
    it('should send subscribe message when connected', () => {
      client.connect();
      MockWebSocket.instances[0].simulateOpen();

      client.subscribe('wo-123');

      const sent = MockWebSocket.instances[0].sent;
      expect(sent).toHaveLength(1);
      expect(JSON.parse(sent[0])).toEqual({
        type: 'subscribe',
        workOrderId: 'wo-123',
      });
    });

    it('should queue subscription if not connected', () => {
      client.subscribe('wo-123');
      client.connect();
      MockWebSocket.instances[0].simulateOpen();

      const sent = MockWebSocket.instances[0].sent;
      expect(sent.some(s => JSON.parse(s).workOrderId === 'wo-123')).toBe(true);
    });
  });

  describe('unsubscribe', () => {
    it('should send unsubscribe message', () => {
      client.connect();
      MockWebSocket.instances[0].simulateOpen();
      client.subscribe('wo-123');

      client.unsubscribe('wo-123');

      const sent = MockWebSocket.instances[0].sent;
      const unsubMsg = sent.find(s => JSON.parse(s).type === 'unsubscribe');
      expect(unsubMsg).toBeDefined();
      expect(JSON.parse(unsubMsg!).workOrderId).toBe('wo-123');
    });
  });

  describe('event handling', () => {
    it('should emit events to listeners', () => {
      const listener = vi.fn();
      client.connect();
      MockWebSocket.instances[0].simulateOpen();

      client.on('workorder:updated', listener);
      MockWebSocket.instances[0].simulateMessage({
        type: 'workorder:updated',
        workOrderId: 'wo-123',
        data: { status: 'running' },
      });

      expect(listener).toHaveBeenCalledWith({
        type: 'workorder:updated',
        workOrderId: 'wo-123',
        data: { status: 'running' },
      });
    });

    it('should allow removing listeners', () => {
      const listener = vi.fn();
      client.connect();
      MockWebSocket.instances[0].simulateOpen();

      client.on('workorder:updated', listener);
      client.off('workorder:updated', listener);

      MockWebSocket.instances[0].simulateMessage({
        type: 'workorder:updated',
        workOrderId: 'wo-123',
        data: {},
      });

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('ping/pong', () => {
    it('should respond to pong messages', () => {
      const listener = vi.fn();
      client.connect();
      MockWebSocket.instances[0].simulateOpen();
      client.on('pong', listener);

      MockWebSocket.instances[0].simulateMessage({
        type: 'pong',
        timestamp: new Date().toISOString(),
      });

      expect(listener).toHaveBeenCalled();
    });
  });
});
```

#### Task 4.3: useWorkOrders Hook Tests

**File**: `packages/dashboard/src/hooks/__tests__/useWorkOrders.test.tsx`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '../../test/utils';
import { useWorkOrders } from '../useWorkOrders';
import * as workOrdersApi from '../../api/work-orders';

vi.mock('../../api/work-orders');

describe('useWorkOrders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch work orders on mount', async () => {
    const mockData = {
      work_orders: [
        { id: 'wo-1', status: 'queued', taskPrompt: 'Test 1' },
        { id: 'wo-2', status: 'running', taskPrompt: 'Test 2' },
      ],
      total: 2,
    };

    vi.mocked(workOrdersApi.listWorkOrders).mockResolvedValueOnce(mockData);

    const { result } = renderHook(() => useWorkOrders());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(mockData);
  });

  it('should pass params to API call', async () => {
    vi.mocked(workOrdersApi.listWorkOrders).mockResolvedValueOnce({
      work_orders: [],
      total: 0,
    });

    const params = { status: 'running' as const, limit: 5 };
    renderHook(() => useWorkOrders(params));

    await waitFor(() => {
      expect(workOrdersApi.listWorkOrders).toHaveBeenCalledWith(params);
    });
  });

  it('should handle errors', async () => {
    const error = new Error('Network error');
    vi.mocked(workOrdersApi.listWorkOrders).mockRejectedValueOnce(error);

    const { result } = renderHook(() => useWorkOrders());

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeDefined();
  });
});
```

#### Task 4.4: Component Test Example

**File**: `packages/dashboard/src/components/__tests__/StatusBadge.test.tsx`

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '../../test/utils';
import { StatusBadge } from '../StatusBadge';

describe('StatusBadge', () => {
  it('renders queued status correctly', () => {
    render(<StatusBadge status="queued" />);

    expect(screen.getByText('queued')).toBeInTheDocument();
  });

  it('renders running status with appropriate styling', () => {
    render(<StatusBadge status="running" />);

    const badge = screen.getByText('running');
    expect(badge).toBeInTheDocument();
    // Check for running-specific class
    expect(badge).toHaveClass(/running|animate/i);
  });

  it('renders succeeded status', () => {
    render(<StatusBadge status="succeeded" />);

    expect(screen.getByText('succeeded')).toBeInTheDocument();
  });

  it('renders failed status', () => {
    render(<StatusBadge status="failed" />);

    expect(screen.getByText('failed')).toBeInTheDocument();
  });

  it('renders canceled status', () => {
    render(<StatusBadge status="canceled" />);

    expect(screen.getByText('canceled')).toBeInTheDocument();
  });
});
```

### Work Order for Thrust 3-4

**Prompt for AgentGate**:
```
Set up Vitest testing infrastructure for @agentgate/dashboard and write initial tests.

TASKS:
1. Install test dependencies:
   - vitest
   - @testing-library/react
   - @testing-library/jest-dom
   - @testing-library/user-event
   - jsdom

2. Create packages/dashboard/vitest.config.ts with:
   - React plugin
   - jsdom environment
   - Setup file reference
   - Coverage configuration

3. Create packages/dashboard/src/test/setup.ts with:
   - @testing-library/jest-dom/vitest import
   - Cleanup after each test
   - Window mocks (matchMedia, ResizeObserver)

4. Create packages/dashboard/src/test/utils.tsx with:
   - Custom render with QueryClient and Router
   - Re-export testing-library utilities

5. Update packages/dashboard/package.json scripts:
   - "test": "vitest run"
   - "test:watch": "vitest"
   - "test:coverage": "vitest run --coverage"

6. Write API client tests (src/api/__tests__/client.test.ts):
   - Test apiRequest function
   - Test get/post/del helpers
   - Test error handling

7. Write WebSocket client tests (src/api/__tests__/websocket.test.ts):
   - Test connect/disconnect
   - Test subscribe/unsubscribe
   - Test event handling

8. Write hook tests (src/hooks/__tests__/useWorkOrders.test.tsx):
   - Test data fetching
   - Test parameter passing
   - Test error states

9. Ensure all tests pass with pnpm test

VERIFICATION:
- pnpm --filter @agentgate/dashboard test passes
- All tests are deterministic (no flaky tests)
- Coverage report generates successfully

CONSTRAINTS:
- Use vitest, not jest
- Use @testing-library/react for component tests
- Follow existing code patterns
- Mock external dependencies appropriately
```

### Completion Checklist

- [ ] Test dependencies installed
- [ ] Vitest configured with jsdom environment
- [ ] Test setup file created with proper mocks
- [ ] Test utilities created with custom render
- [ ] Package.json scripts updated
- [ ] API client tests written and passing
- [ ] WebSocket client tests written and passing
- [ ] At least one hook test written
- [ ] All tests pass
