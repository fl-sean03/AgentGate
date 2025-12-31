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
        statusText: 'Not Found',
        json: () => Promise.resolve({
          error: 'Resource not found',
        }),
      });

      await expect(apiRequest('/test', { method: 'GET' })).rejects.toThrow(ApiError);
    });

    it('should parse error response correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({
          error: 'Invalid input',
        }),
      });

      try {
        await apiRequest('/test', { method: 'GET' });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).status).toBe(400);
        expect((error as ApiError).message).toBe('Invalid input');
      }
    });

    it('should handle JSON parse error in error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.reject(new Error('Invalid JSON')),
      });

      try {
        await apiRequest('/test', { method: 'GET' });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).status).toBe(500);
        expect((error as ApiError).message).toContain('HTTP 500');
      }
    });

    it('should handle 204 No Content response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: () => Promise.resolve(),
      });

      const result = await apiRequest('/test', { method: 'DELETE' });

      expect(result).toBeUndefined();
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      try {
        await apiRequest('/test', { method: 'GET' });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).message).toContain('Network error');
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

    it('should skip undefined params', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: [] }),
      });

      await get('/work-orders', { limit: 10, status: undefined });

      const callUrl = mockFetch.mock.calls[0][0] as string;
      expect(callUrl).toContain('limit=10');
      expect(callUrl).not.toContain('status');
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

      const callBody = mockFetch.mock.calls[0][1].body;
      expect(JSON.parse(callBody)).toEqual({ taskPrompt: 'Test' });
    });

    it('should handle POST without body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await post('/work-orders');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: undefined,
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
