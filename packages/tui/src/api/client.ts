import ky, { type KyInstance, HTTPError } from 'ky';
import { getAuthManager } from './auth.js';
import type {
  Repository,
  WorkOrder,
  Run,
  ApiError,
  ApiResponse,
  CreateWorkOrderRequest,
  PaginatedResponse,
  DeviceCodeResponse,
  AuthToken,
} from './types.js';

export class ApiClient {
  private client: KyInstance;
  private baseUrl: string;

  constructor(baseUrl?: string, token?: string) {
    this.baseUrl =
      baseUrl || getAuthManager().getApiUrl();
    const authToken = token || getAuthManager().getToken();

    this.client = ky.create({
      prefixUrl: this.baseUrl,
      headers: authToken
        ? {
            Authorization: `Bearer ${authToken}`,
          }
        : undefined,
      timeout: 30000,
      retry: {
        limit: 2,
        methods: ['get'],
        statusCodes: [408, 500, 502, 503, 504],
      },
    });
  }

  private async handleError(error: unknown): Promise<never> {
    if (error instanceof HTTPError) {
      try {
        const body = (await error.response.json()) as { error?: ApiError };
        throw new ApiClientError(
          body.error?.message || error.message,
          body.error?.code || 'UNKNOWN_ERROR',
          error.response.status
        );
      } catch (parseError) {
        if (parseError instanceof ApiClientError) {
          throw parseError;
        }
        throw new ApiClientError(
          error.message,
          'HTTP_ERROR',
          error.response.status
        );
      }
    }
    throw new ApiClientError(
      error instanceof Error ? error.message : 'Unknown error',
      'UNKNOWN_ERROR',
      0
    );
  }

  // Auth endpoints
  async initiateDeviceAuth(): Promise<DeviceCodeResponse> {
    try {
      return await this.client.post('auth/device').json<DeviceCodeResponse>();
    } catch (error) {
      return this.handleError(error);
    }
  }

  async pollDeviceAuth(deviceCode: string): Promise<AuthToken | null> {
    try {
      const response = await this.client
        .get(`auth/device/${deviceCode}`)
        .json<{ status: string; token?: AuthToken }>();

      if (response.status === 'complete' && response.token) {
        return response.token;
      }
      return null;
    } catch (error) {
      if (error instanceof HTTPError && error.response.status === 400) {
        // Still pending
        return null;
      }
      return this.handleError(error);
    }
  }

  // Repository endpoints
  async getRepos(): Promise<Repository[]> {
    try {
      const response = await this.client
        .get('api/v1/repos')
        .json<ApiResponse<Repository[]>>();

      if (!response.success || !response.data) {
        throw new ApiClientError(
          response.error?.message || 'Failed to fetch repos',
          response.error?.code || 'FETCH_ERROR',
          0
        );
      }

      return response.data.map((repo) => ({
        ...repo,
        pushedAt: new Date(repo.pushedAt),
      }));
    } catch (error) {
      if (error instanceof ApiClientError) {
        throw error;
      }
      return this.handleError(error);
    }
  }

  // Work Order endpoints
  async submitWorkOrder(request: CreateWorkOrderRequest): Promise<WorkOrder> {
    try {
      const response = await this.client
        .post('api/v1/work-orders', {
          json: {
            taskPrompt: request.taskPrompt,
            workspaceSource: request.workspaceSource,
            agentType: request.agentType || 'claude-code-subscription',
            maxIterations: request.maxIterations || 3,
            gatePlanSource: request.gatePlanSource || 'auto',
          },
        })
        .json<ApiResponse<WorkOrder>>();

      if (!response.success || !response.data) {
        throw new ApiClientError(
          response.error?.message || 'Failed to submit work order',
          response.error?.code || 'SUBMIT_ERROR',
          0
        );
      }

      return {
        ...response.data,
        createdAt: new Date(response.data.createdAt),
        updatedAt: new Date(response.data.updatedAt),
      };
    } catch (error) {
      if (error instanceof ApiClientError) {
        throw error;
      }
      return this.handleError(error);
    }
  }

  async getWorkOrder(id: string): Promise<WorkOrder> {
    try {
      const response = await this.client
        .get(`api/v1/work-orders/${id}`)
        .json<ApiResponse<WorkOrder>>();

      if (!response.success || !response.data) {
        throw new ApiClientError(
          response.error?.message || 'Failed to fetch work order',
          response.error?.code || 'FETCH_ERROR',
          0
        );
      }

      return {
        ...response.data,
        createdAt: new Date(response.data.createdAt),
        updatedAt: new Date(response.data.updatedAt),
      };
    } catch (error) {
      if (error instanceof ApiClientError) {
        throw error;
      }
      return this.handleError(error);
    }
  }

  async cancelWorkOrder(id: string): Promise<void> {
    try {
      await this.client.delete(`api/v1/work-orders/${id}`);
    } catch (error) {
      return this.handleError(error);
    }
  }

  // Run endpoints
  async getRuns(
    page = 1,
    pageSize = 20,
    status?: string
  ): Promise<PaginatedResponse<Run>> {
    try {
      const searchParams: Record<string, string | number> = {
        page,
        pageSize,
      };
      if (status) {
        searchParams['status'] = status;
      }

      const response = await this.client
        .get('api/v1/runs', { searchParams })
        .json<ApiResponse<PaginatedResponse<Run>>>();

      if (!response.success || !response.data) {
        throw new ApiClientError(
          response.error?.message || 'Failed to fetch runs',
          response.error?.code || 'FETCH_ERROR',
          0
        );
      }

      return {
        ...response.data,
        items: response.data.items.map((run) => ({
          ...run,
          startedAt: new Date(run.startedAt),
          completedAt: run.completedAt ? new Date(run.completedAt) : undefined,
        })),
      };
    } catch (error) {
      if (error instanceof ApiClientError) {
        throw error;
      }
      return this.handleError(error);
    }
  }

  async getRun(id: string): Promise<Run> {
    try {
      const response = await this.client
        .get(`api/v1/runs/${id}`)
        .json<ApiResponse<Run>>();

      if (!response.success || !response.data) {
        throw new ApiClientError(
          response.error?.message || 'Failed to fetch run',
          response.error?.code || 'FETCH_ERROR',
          0
        );
      }

      return {
        ...response.data,
        startedAt: new Date(response.data.startedAt),
        completedAt: response.data.completedAt
          ? new Date(response.data.completedAt)
          : undefined,
      };
    } catch (error) {
      if (error instanceof ApiClientError) {
        throw error;
      }
      return this.handleError(error);
    }
  }

  getStreamUrl(runId: string): string {
    return `${this.baseUrl}/api/v1/runs/${runId}/stream`;
  }
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

// Singleton instance
let apiClientInstance: ApiClient | null = null;

export function getApiClient(baseUrl?: string, token?: string): ApiClient {
  if (!apiClientInstance || baseUrl || token) {
    apiClientInstance = new ApiClient(baseUrl, token);
  }
  return apiClientInstance;
}

export function resetApiClient(): void {
  apiClientInstance = null;
}
