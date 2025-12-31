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
        {
          id: 'wo-1',
          status: 'queued' as const,
          prompt: 'Test 1',
          workspace_source: { type: 'local' as const, path: '/test' },
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'wo-2',
          status: 'running' as const,
          prompt: 'Test 2',
          workspace_source: { type: 'git' as const, url: 'https://github.com/test/repo' },
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
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
    expect(result.current.isSuccess).toBe(true);
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

  it('should refetch when params change', async () => {
    vi.mocked(workOrdersApi.listWorkOrders).mockResolvedValue({
      work_orders: [],
      total: 0,
    });

    const { rerender } = renderHook(
      (props: { status?: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled' }) =>
        useWorkOrders({ status: props.status }),
      {
        initialProps: { status: 'queued' as 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled' },
      }
    );

    await waitFor(() => {
      expect(workOrdersApi.listWorkOrders).toHaveBeenCalledWith({ status: 'queued' });
    });

    // Change params
    rerender({ status: 'running' });

    await waitFor(() => {
      expect(workOrdersApi.listWorkOrders).toHaveBeenCalledWith({ status: 'running' });
    });

    expect(workOrdersApi.listWorkOrders).toHaveBeenCalledTimes(2);
  });

  it('should handle empty results', async () => {
    vi.mocked(workOrdersApi.listWorkOrders).mockResolvedValueOnce({
      work_orders: [],
      total: 0,
    });

    const { result } = renderHook(() => useWorkOrders());

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.work_orders).toEqual([]);
    expect(result.current.data?.total).toBe(0);
  });

  it('should support multiple work order statuses', async () => {
    const mockData = {
      work_orders: [
        {
          id: 'wo-1',
          status: 'succeeded' as const,
          prompt: 'Completed task',
          workspace_source: { type: 'local' as const, path: '/test' },
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          completed_at: '2024-01-01T01:00:00Z',
        },
        {
          id: 'wo-2',
          status: 'failed' as const,
          prompt: 'Failed task',
          workspace_source: { type: 'local' as const, path: '/test' },
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          completed_at: '2024-01-01T01:00:00Z',
          error_message: 'Task failed',
        },
      ],
      total: 2,
    };

    vi.mocked(workOrdersApi.listWorkOrders).mockResolvedValueOnce(mockData);

    const { result } = renderHook(() => useWorkOrders());

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.work_orders).toHaveLength(2);
    expect(result.current.data?.work_orders[0].status).toBe('succeeded');
    expect(result.current.data?.work_orders[1].status).toBe('failed');
  });

  it('should handle pagination params', async () => {
    vi.mocked(workOrdersApi.listWorkOrders).mockResolvedValueOnce({
      work_orders: [],
      total: 0,
    });

    const params = { limit: 25, offset: 50 };
    renderHook(() => useWorkOrders(params));

    await waitFor(() => {
      expect(workOrdersApi.listWorkOrders).toHaveBeenCalledWith(params);
    });
  });
});
