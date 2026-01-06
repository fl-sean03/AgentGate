/**
 * Usage Resource
 *
 * Usage reporting and analytics for B2B organizations.
 */

/**
 * Usage summary for a time period
 */
export interface UsageSummary {
  /** Start of the period */
  periodStart: string;
  /** End of the period */
  periodEnd: string;
  /** Total runs */
  totalRuns: number;
  /** Successful runs */
  successfulRuns: number;
  /** Failed runs */
  failedRuns: number;
  /** Total cost in cents */
  totalCostCents: number;
  /** Total tokens used */
  totalTokens: number;
  /** Average duration in ms */
  averageDurationMs: number;
}

/**
 * Usage by tenant user
 */
export interface TenantUsage {
  /** Tenant user ID */
  tenantUserId: string;
  /** Total runs */
  runs: number;
  /** Cost in cents */
  costCents: number;
  /** Tokens used */
  tokens: number;
  /** Last activity timestamp */
  lastActivity: string;
}

/**
 * Daily usage breakdown
 */
export interface DailyUsage {
  /** Date (YYYY-MM-DD) */
  date: string;
  /** Number of runs */
  runs: number;
  /** Cost in cents */
  costCents: number;
  /** Tokens used */
  tokens: number;
}

/**
 * Credit balance information
 */
export interface CreditBalance {
  /** Included credits (resets monthly) */
  includedCents: number;
  /** Purchased credits */
  purchasedCents: number;
  /** Total available */
  totalCents: number;
  /** Usage this period */
  usedCents: number;
  /** Remaining this period */
  remainingCents: number;
  /** Next reset date */
  nextResetDate: string;
}

/**
 * Usage query options
 */
export interface UsageQueryOptions {
  /** Start date (ISO 8601) */
  startDate?: string;
  /** End date (ISO 8601) */
  endDate?: string;
  /** Group by period */
  groupBy?: 'day' | 'week' | 'month';
}

/**
 * Tenant usage query options
 */
export interface TenantUsageQueryOptions extends UsageQueryOptions {
  /** Filter by tenant user ID */
  tenantUserId?: string;
  /** Limit results */
  limit?: number;
}

type RequestFn = <T>(
  method: string,
  path: string,
  options?: { body?: unknown; params?: Record<string, string> }
) => Promise<T>;

/**
 * Usage API resource
 */
export class UsageResource {
  constructor(private request: RequestFn) {}

  /**
   * Get usage summary for the current organization
   */
  async getSummary(options: UsageQueryOptions = {}): Promise<UsageSummary> {
    const params: Record<string, string> = {};
    if (options.startDate) params.startDate = options.startDate;
    if (options.endDate) params.endDate = options.endDate;

    return this.request('GET', '/api/v1/usage/summary', { params });
  }

  /**
   * Get daily usage breakdown
   */
  async getDaily(options: UsageQueryOptions = {}): Promise<DailyUsage[]> {
    const params: Record<string, string> = {};
    if (options.startDate) params.startDate = options.startDate;
    if (options.endDate) params.endDate = options.endDate;
    if (options.groupBy) params.groupBy = options.groupBy;

    return this.request('GET', '/api/v1/usage/daily', { params });
  }

  /**
   * Get usage by tenant user
   */
  async getByTenant(options: TenantUsageQueryOptions = {}): Promise<TenantUsage[]> {
    const params: Record<string, string> = {};
    if (options.startDate) params.startDate = options.startDate;
    if (options.endDate) params.endDate = options.endDate;
    if (options.tenantUserId) params.tenantUserId = options.tenantUserId;
    if (options.limit) params.limit = String(options.limit);

    return this.request('GET', '/api/v1/usage/by-tenant', { params });
  }

  /**
   * Get credit balance for the current organization
   */
  async getBalance(): Promise<CreditBalance> {
    return this.request('GET', '/api/v1/usage/balance');
  }

  /**
   * Check if sufficient credits are available
   */
  async checkCredits(estimatedCostCents: number): Promise<{
    sufficient: boolean;
    balance: number;
    requested: number;
    shortfall?: number;
  }> {
    return this.request('POST', '/api/v1/usage/check', {
      body: { estimatedCostCents },
    });
  }

  /**
   * Export usage data as CSV
   */
  async exportCsv(options: UsageQueryOptions = {}): Promise<string> {
    const params: Record<string, string> = { format: 'csv' };
    if (options.startDate) params.startDate = options.startDate;
    if (options.endDate) params.endDate = options.endDate;

    return this.request('GET', '/api/v1/usage/export', { params });
  }
}
