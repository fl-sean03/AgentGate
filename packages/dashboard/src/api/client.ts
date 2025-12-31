/**
 * Base API client for AgentGate HTTP API
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public statusText: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

/**
 * Get the base URL for API requests
 * Reads from VITE_API_URL environment variable, defaults to http://localhost:3001
 */
function getBaseUrl(): string {
  return import.meta.env.VITE_API_URL || 'http://localhost:3001';
}

/**
 * Get the API key from localStorage
 */
function getApiKey(): string | null {
  return localStorage.getItem('agentgate_api_key');
}

/**
 * Build URL with query parameters
 */
function buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
  const baseUrl = getBaseUrl();
  const url = new URL(path, baseUrl);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });
  }

  return url.toString();
}

/**
 * Make a type-safe HTTP request to the AgentGate API
 */
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { params, ...fetchOptions } = options;
  const url = buildUrl(path, params);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Add API key if available
  const apiKey = getApiKey();
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  // Merge with existing headers
  if (fetchOptions.headers) {
    const existingHeaders = fetchOptions.headers as Record<string, string>;
    Object.assign(headers, existingHeaders);
  }

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      headers,
    });

    // Handle error responses
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }
      } catch {
        // If we can't parse the error response, use the default message
      }

      throw new ApiError(errorMessage, response.status, response.statusText);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    // Parse JSON response
    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    // Handle network errors
    if (error instanceof Error) {
      throw new ApiError(
        `Network error: ${error.message}`,
        0,
        'Network Error',
      );
    }

    throw new ApiError(
      'An unknown error occurred',
      0,
      'Unknown Error',
    );
  }
}

/**
 * Make a GET request
 */
export async function get<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
): Promise<T> {
  return apiRequest<T>(path, { method: 'GET', params });
}

/**
 * Make a POST request
 */
export async function post<T>(
  path: string,
  body?: unknown,
): Promise<T> {
  return apiRequest<T>(path, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Make a PUT request
 */
export async function put<T>(
  path: string,
  body?: unknown,
): Promise<T> {
  return apiRequest<T>(path, {
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Make a DELETE request
 */
export async function del<T>(
  path: string,
): Promise<T> {
  return apiRequest<T>(path, { method: 'DELETE' });
}

/**
 * Make a PATCH request
 */
export async function patch<T>(
  path: string,
  body?: unknown,
): Promise<T> {
  return apiRequest<T>(path, {
    method: 'PATCH',
    body: body ? JSON.stringify(body) : undefined,
  });
}
